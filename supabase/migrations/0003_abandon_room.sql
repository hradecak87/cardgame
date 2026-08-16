-- room abandonment: allow either participant to mark a live room as
-- abandoned so realtime can notify the opponent and both clients can stop
-- reconnecting to stale room codes after one player leaves.
alter table public.rooms
  drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting', 'dealing', 'playing', 'finished', 'abandoned'));

alter table public.rooms
  add column if not exists abandoned_by uuid;

comment on column public.rooms.abandoned_by is
  'Stores the auth.uid() of the participant who abandoned the room for realtime leave notifications and stale-room cleanup.';
