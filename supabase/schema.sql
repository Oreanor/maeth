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
  updated_at timestamptz not null default now()
);

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

create index if not exists game_players_user_id_idx on public.game_players(user_id);
create index if not exists game_invites_game_id_idx on public.game_invites(game_id);
create index if not exists game_actions_game_id_idx on public.game_actions(game_id);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_invites enable row level security;
alter table public.game_actions enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

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
