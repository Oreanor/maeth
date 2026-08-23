-- Rematch grouping was added after the initial schema.
alter table public.games
  add column if not exists root_id uuid references public.games(id) on delete set null;

create index if not exists games_root_id_idx on public.games(root_id);

-- Atomically compare-and-swap a validated game transition together with its
-- audit record. An empty result means another request committed first.
create or replace function public.commit_game_action(
  p_game_id uuid,
  p_expected_updated_at timestamptz,
  p_next_state jsonb,
  p_next_status text,
  p_user_id uuid,
  p_action_type text,
  p_payload jsonb
)
returns table (
  id bigint,
  user_id uuid,
  action_type text,
  payload jsonb,
  created_at timestamptz,
  game_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_updated_at timestamptz;
  committed_at timestamptz;
  saved public.game_actions%rowtype;
begin
  select g.updated_at
    into current_updated_at
    from public.games g
    where g.id = p_game_id
    for update;

  if not found or current_updated_at <> p_expected_updated_at then
    return;
  end if;

  committed_at := clock_timestamp();
  update public.games
    set state = p_next_state,
        status = p_next_status,
        updated_at = committed_at
    where games.id = p_game_id;

  insert into public.game_actions (game_id, user_id, action_type, payload, resulting_state)
    values (p_game_id, p_user_id, p_action_type, p_payload, p_next_state)
    returning * into saved;

  return query
    select saved.id, saved.user_id, saved.action_type, saved.payload,
           saved.created_at, committed_at;
end;
$$;

revoke execute on function public.commit_game_action(uuid, timestamptz, jsonb, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_game_action(uuid, timestamptz, jsonb, text, uuid, text, jsonb)
  to service_role;
