-- join_room: the ONLY way a second player claims the open seat in a room.
-- SECURITY DEFINER so it can update a row even though rooms_update_participant
-- (see migration 0001) would otherwise reject an unrecognized joiner. Does
-- its own validation instead of relying on RLS, and performs the guarded
-- 'waiting' -> 'dealing' transition atomically so two simultaneous joiners
-- can't both succeed (only one UPDATE ... WHERE status = 'waiting' matches).
create or replace function public.join_room(p_code text, p_nickname text)
returns table (room_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_joiner_uid uuid := auth.uid();
  v_room_id uuid;
begin
  if v_joiner_uid is null then
    raise exception 'join_room requires an authenticated (anonymous) session';
  end if;

  update public.rooms
  set
    player_b_nickname = p_nickname,
    player_b_uid = v_joiner_uid,
    status = 'dealing',
    version = version + 1
  where code = p_code
    and status = 'waiting'
    and player_a_uid is not null
    and player_b_uid is null
    and player_a_uid is distinct from v_joiner_uid
  returning id into v_room_id;

  if v_room_id is null then
    raise exception 'Room % is not open to join (missing, already full, or already started)', p_code;
  end if;

  return query select v_room_id;
end;
$$;

grant execute on function public.join_room(text, text) to authenticated, anon;

-- deal_room: performs the one deal step that must briefly see both hands
-- at once (see Trust Model in the design spec). Restricted to the room's
-- own two participants and requires both seats to be filled, so a
-- non-participant who merely knows/guesses a room id cannot force a deal.
create or replace function public.deal_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_player_a_uid uuid;
  v_player_b_uid uuid;
  v_caller_uid uuid := auth.uid();
  v_ranks text[] := array['7','8','9','10','J','Q','K','A'];
  v_powers int[] := array[1,2,3,4,5,6,7,8];
  v_suits text[] := array['hearts','diamonds','clubs','spades'];
  v_deck jsonb := '[]'::jsonb;
  v_aces jsonb := '[]'::jsonb;
  v_non_aces jsonb := '[]'::jsonb;
  v_a_hand jsonb;
  v_b_hand jsonb;
  v_attacker text;
  suit text;
  i int;
  card jsonb;
begin
  -- Lock the room row so a concurrent/retried call is idempotent.
  select status, player_a_uid, player_b_uid
    into v_status, v_player_a_uid, v_player_b_uid
    from public.rooms where id = p_room_id for update;

  if v_status is distinct from 'dealing' then
    -- Either already dealt, or the room doesn't exist / isn't ready.
    return;
  end if;

  if v_caller_uid is null or v_caller_uid not in (v_player_a_uid, v_player_b_uid) then
    raise exception 'Only room participants may deal room %', p_room_id;
  end if;

  if v_player_a_uid is null or v_player_b_uid is null then
    -- Should be unreachable once status = 'dealing' (join_room only sets
    -- that status after filling both seats), but guard anyway.
    raise exception 'Room % does not have two players yet', p_room_id;
  end if;

  -- Build the 32-card deck.
  foreach suit in array v_suits loop
    for i in 1..8 loop
      card := jsonb_build_object(
        'id', v_ranks[i] || '-' || suit,
        'rank', v_ranks[i],
        'suit', suit,
        'power', v_powers[i]
      );
      v_deck := v_deck || jsonb_build_array(card);
    end loop;
  end loop;

  select jsonb_agg(elem order by random())
    into v_aces
    from jsonb_array_elements(v_deck) elem
    where elem->>'rank' = 'A';

  select jsonb_agg(elem order by random())
    into v_non_aces
    from jsonb_array_elements(v_deck) elem
    where elem->>'rank' <> 'A';

  -- Both sides get exactly 2 of the 4 aces (PvP ace guarantee), plus 14
  -- non-aces each, for 16 cards per side / 32 total.
  v_a_hand := (select jsonb_agg(elem) from jsonb_array_elements(v_aces) with ordinality e(elem, idx) where idx <= 2)
    || (select jsonb_agg(elem) from jsonb_array_elements(v_non_aces) with ordinality e(elem, idx) where idx <= 14);
  v_b_hand := (select jsonb_agg(elem) from jsonb_array_elements(v_aces) with ordinality e(elem, idx) where idx > 2)
    || (select jsonb_agg(elem) from jsonb_array_elements(v_non_aces) with ordinality e(elem, idx) where idx > 14);

  v_attacker := case when random() < 0.5 then 'a' else 'b' end;

  insert into public.player_hands (room_id, player_uid, available, resting, last_applied_round)
  values (p_room_id, v_player_a_uid, v_a_hand, '[]'::jsonb, 0);

  insert into public.player_hands (room_id, player_uid, available, resting, last_applied_round)
  values (p_room_id, v_player_b_uid, v_b_hand, '[]'::jsonb, 0);

  update public.rooms
  set
    status = 'playing',
    attacker_side = v_attacker,
    public_state = jsonb_build_object(
      'roundNumber', 1,
      'playerA', jsonb_build_object('availableCount', jsonb_array_length(v_a_hand), 'resting', '[]'::jsonb),
      'playerB', jsonb_build_object('availableCount', jsonb_array_length(v_b_hand), 'resting', '[]'::jsonb),
      'phase', 'selecting',
      'combat', null,
      'roundSummaryDismissedBy', jsonb_build_object('a', false, 'b', false),
      'roundEndAppliedBy', jsonb_build_object('a', false, 'b', false)
    ),
    version = version + 1
  where id = p_room_id;
end;
$$;

-- Callable by any anon session (both join_room and deal_room are safe to
-- expose broadly: join_room validates the room/seat itself, and deal_room
-- checks caller-is-a-participant plus the row lock/status guard above).
grant execute on function public.deal_room(uuid) to authenticated, anon;
