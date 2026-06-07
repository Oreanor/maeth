create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  provider text not null default 'google',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Bumped on every authenticated API request → "online on the site" presence.
  last_seen timestamptz not null default now()
);

-- Migration for existing databases:
--   alter table public.profiles add column if not exists last_seen timestamptz not null default now();

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'over', 'cancelled')),
  state jsonb not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Points to the follow-up game once a rematch is started.
  rematch_id uuid references public.games(id) on delete set null,
  -- When false, contested captures are resolved as clean takes (no dice).
  duels_enabled boolean not null default true
);

-- Migration for existing databases:
--   alter table public.games add column if not exists rematch_id uuid references public.games(id) on delete set null;
--   alter table public.games add column if not exists duels_enabled boolean not null default true;

create table if not exists public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  color text not null check (color in ('white', 'black')),
  joined_at timestamptz not null default now(),
  -- Bumped when the player fetches this game → "in this game" presence.
  last_seen timestamptz,
  primary key (game_id, user_id),
  unique (game_id, color)
);

-- Migration for existing databases:
--   alter table public.game_players add column if not exists last_seen timestamptz;

create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  invited_user_id uuid references public.profiles(id) on delete set null,
  -- Email invite for a friend who may not have a Maeth account yet. When that
  -- email logs in, the invite is matched to them (see listGames / join).
  invited_email text,
  status text not null default 'open' check (status in ('open', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Migration for existing databases:
--   alter table public.game_invites add column if not exists invited_email text;
create index if not exists game_invites_invited_email_idx on public.game_invites(lower(invited_email));

create table if not exists public.game_actions (
  id bigserial primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('place', 'move')),
  payload jsonb not null,
  resulting_state jsonb not null,
  created_at timestamptz not null default now()
);

-- Immutable record of every finished match, kept separate from `games` so the
-- leaderboard survives players deleting their old games. `game_id` keeps no
-- cascade — deleting the game nulls it but the result stays.
create table if not exists public.game_results (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete set null,
  white_id uuid not null references public.profiles(id) on delete cascade,
  black_id uuid not null references public.profiles(id) on delete cascade,
  outcome text not null check (outcome in ('white', 'black', 'draw')),
  created_at timestamptz not null default now(),
  unique (game_id)
);

-- Migration for existing databases:
--   create table if not exists public.game_results (...as above...);
--   alter table public.game_results enable row level security;
--   create policy "game results are readable by authenticated users"
--     on public.game_results for select to authenticated using (true);
-- Backfill from games already finished before this table existed:
--   insert into public.game_results (game_id, white_id, black_id, outcome, created_at)
--   select g.id, wp.user_id, bp.user_id,
--          case when g.state->'status'->>'kind' = 'draw' then 'draw'
--               else g.state->'status'->>'winner' end,
--          g.updated_at
--   from public.games g
--   join public.game_players wp on wp.game_id = g.id and wp.color = 'white'
--   join public.game_players bp on bp.game_id = g.id and bp.color = 'black'
--   where g.status = 'over'
--   on conflict (game_id) do nothing;

create index if not exists game_players_user_id_idx on public.game_players(user_id);
create index if not exists game_results_white_idx on public.game_results(white_id);
create index if not exists game_results_black_idx on public.game_results(black_id);

-- Per-user friend list (syncs across devices; backfilled from game history).
create table if not exists public.saved_friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- Migration for existing databases:
--   create table if not exists public.saved_friends (...as above...);
--   create index if not exists saved_friends_user_idx on public.saved_friends(user_id);

create index if not exists saved_friends_user_idx on public.saved_friends(user_id);
create index if not exists game_invites_game_id_idx on public.game_invites(game_id);
create index if not exists game_actions_game_id_idx on public.game_actions(game_id);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_invites enable row level security;
alter table public.game_actions enable row level security;
alter table public.game_results enable row level security;
alter table public.saved_friends enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "game results are readable by authenticated users"
  on public.game_results for select
  to authenticated
  using (true);

create policy "users read own saved friends"
  on public.saved_friends for select
  to authenticated
  using (user_id = auth.uid());

create policy "users add own saved friends"
  on public.saved_friends for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users remove own saved friends"
  on public.saved_friends for delete
  to authenticated
  using (user_id = auth.uid());

create policy "users can read their game memberships"
  on public.game_players for select
  to authenticated
  using (user_id = auth.uid());

create policy "players can read their games"
  on public.games for select
  to authenticated
  using (
    exists (
      select 1
      from public.game_players gp
      where gp.game_id = games.id
        and gp.user_id = auth.uid()
    )
  );
