-- rooms: public per-game state, readable/writable per the trust model in
-- docs/superpowers/specs/2026-08-15-online-multiplayer-design.md
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  version integer not null default 0,
  status text not null default 'waiting'
    check (status in ('waiting', 'dealing', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  player_a_nickname text,
  player_b_nickname text,
  player_a_uid uuid,
  player_b_uid uuid,
  attacker_side text check (attacker_side in ('a', 'b')),
  public_state jsonb,
  winner text check (winner in ('a', 'b'))
);

alter table public.rooms enable row level security;

create policy "rooms_select_any" on public.rooms
  for select
  using (true);

create policy "rooms_insert_any" on public.rooms
  for insert
  with check (
    auth.uid() = player_a_uid
    and status = 'waiting'
    and player_b_uid is null
  );

-- IMPORTANT: no "or player_b_uid is null" clause here. That would let ANY
-- anonymous session update ANY column (status/public_state/winner/etc.) of
-- ANY still-open room, not just claim the open seat. Joining a room is
-- instead done exclusively through the guarded join_room() RPC below
-- (SECURITY DEFINER, bypasses this policy safely because it validates the
-- transition itself). Once both seats are filled, only the two recognized
-- participants may update the row directly (e.g. writing public_state).
create policy "rooms_update_participant" on public.rooms
  for update
  using (auth.uid() in (player_a_uid, player_b_uid));

-- Enable Supabase Realtime (Postgres Changes) on rooms so both clients get
-- pushed updates on every write — required by the Sync Protocol in the
-- design spec (public_state changes must propagate without polling).
-- player_hands is intentionally NOT added here: it's private, so each
-- client only ever needs to read its own row on demand, not subscribe to
-- opponent changes on it.
alter publication supabase_realtime add table public.rooms;

-- player_hands: private per-player state, RLS-restricted to the owning
-- auth.uid(). Rows are only ever created by the deal_room() function
-- (SECURITY DEFINER, added in migration 0002), never by direct client
-- INSERT, so no INSERT policy is defined for regular clients.
create table if not exists public.player_hands (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_uid uuid not null,
  available jsonb not null default '[]'::jsonb,
  resting jsonb not null default '[]'::jsonb,
  pending_attack_queue jsonb,
  pending_defender_pool jsonb,
  last_applied_round integer not null default 0,
  primary key (room_id, player_uid)
);

alter table public.player_hands enable row level security;

create policy "player_hands_select_own" on public.player_hands
  for select
  using (auth.uid() = player_uid);

create policy "player_hands_update_own" on public.player_hands
  for update
  using (auth.uid() = player_uid);

-- Lets a participant delete their own finished/abandoned room (used by
-- manual verification/cleanup in Chunk 4, and by future "leave room" UX).
-- Never exposed as the primary game-over flow — status='finished' is set
-- normally without deleting the row.
create policy "rooms_delete_participant" on public.rooms
  for delete
  using (auth.uid() in (player_a_uid, player_b_uid));
