# Multiplayer Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supabase backend (schema, RLS policies, `deal_room` dealing function) and the client-side helper modules (Supabase client/auth, room-code generation) that the multiplayer gameplay layer (a separate, follow-up plan) will build on top of.

**Architecture:** A new Supabase Postgres project holds two tables (`rooms` public state, `player_hands` private per-player state) plus one `SECURITY DEFINER` PL/pgSQL function (`deal_room`) that performs the one deal step that must see both hands at once. All game rule logic besides dealing stays client-side and is added in the follow-up plan. This plan only adds the backend + the two small "leaf" client modules (`supabaseClient.ts`, `roomCode.ts`) that have no dependency on gameplay UI, so they can be fully unit-tested in isolation.

**Tech Stack:** Supabase (Postgres, Row Level Security, Realtime, Anonymous Auth), `@supabase/supabase-js`, TypeScript, Jest.

**Reference spec:** `docs/superpowers/specs/2026-08-15-online-multiplayer-design.md` (read this first — it explains *why* each schema/RLS/RPC decision was made; this plan only says *what* to build).

---

## Chunk 1: Supabase project + schema + RLS + deal_room function

This chunk is mostly manual/hands-on (the user has said they'll want help doing this interactively), plus committing the SQL migration files that document/reproduce those manual steps.

**Files:**
- Create: `supabase/migrations/0001_rooms_and_player_hands.sql`
- Create: `supabase/migrations/0002_room_functions.sql`
- Create: `supabase/README.md`
- Create: `.env.local.example`
- Modify: `.gitignore` (ensure `.env.local` is ignored — verify, don't duplicate if already covered)

- [ ] **Step 1: Create a new Supabase project (interactive, with the user)**

This step is done together with the user in the Supabase dashboard (https://supabase.com/dashboard), not by running a script:
1. Create a new Supabase project (any region close to the user; free tier is enough).
2. Once provisioned, open Project Settings → API and note down:
   - `Project URL` (e.g. `https://xxxxxxxx.supabase.co`)
   - `anon public` API key
3. Open Authentication → Providers → and enable **Anonymous Sign-Ins** (it's off by default on new projects).

Stop here and confirm with the user that the project is created and anonymous auth is enabled before continuing.

- [ ] **Step 2: Write the `rooms` + `player_hands` schema migration**

Create `supabase/migrations/0001_rooms_and_player_hands.sql`:

```sql
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
```

- [ ] **Step 3: Write the `join_room` and `deal_room` function migration**

Create `supabase/migrations/0002_room_functions.sql`. This holds the two
`SECURITY DEFINER` functions clients call: `join_room` (guarded seat-claim,
replacing the unsafe "anyone can UPDATE an open-seat room" RLS approach) and
`deal_room` (the shuffle + PvP ace-guarantee deal, matching `lib/game/deck.ts`'s
card shape — `id`, `rank`, `suit`, `power` — and the PvP ace-guarantee rule
from the spec):

```sql
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
```

- [ ] **Step 4: Apply the migrations to the Supabase project**

With the user, either paste both SQL files (`0001_rooms_and_player_hands.sql`,
`0002_room_functions.sql`) into the Supabase dashboard's SQL Editor and run
them in order, or use the Supabase CLI if the user prefers (`supabase link`,
`supabase db push`) — whichever the user finds easier is fine; there's no
automated test runner for this step, it's a one-time setup action. Confirm
afterwards that Table Editor shows both `rooms` and `player_hands` tables,
and Database → Functions shows both `join_room` and `deal_room`.

- [ ] **Step 5: Document the setup + add env var template**

Create `supabase/README.md`:

```markdown
# Supabase setup for online multiplayer

This project uses Supabase (Postgres + Realtime + Anonymous Auth) only for
the "Hrát s kamarádem online" multiplayer mode. Single-player vs. NPC never
touches Supabase.

## One-time setup
1. Create a Supabase project at https://supabase.com/dashboard.
2. Authentication → Providers → enable **Anonymous Sign-Ins**.
3. Run the SQL files in `supabase/migrations/` in order (SQL Editor, or
   `supabase db push` if using the CLI) — creates `rooms`, `player_hands`,
   and the `deal_room` function.
4. Copy `.env.local.example` to `.env.local` and fill in the values from
   Project Settings → API (`Project URL` → `NEXT_PUBLIC_SUPABASE_URL`,
   `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
5. Add the same two env vars in Vercel (Project → Settings →
   Environment Variables) so the deployed app can reach Supabase too.
```

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Check `.gitignore` already has a `.env*.local` (or equivalent) entry; if not,
add one — never commit the real `.env.local`.

- [ ] **Step 6: Commit**

```bash
git add supabase/ .env.local.example .gitignore
git commit -m "Add Supabase schema, RLS policies, and deal_room migration for multiplayer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: `lib/multiplayer/supabaseClient.ts` — client init + anonymous auth

**Files:**
- Create: `lib/multiplayer/supabaseClient.ts`
- Test: `lib/multiplayer/supabaseClient.test.ts`
- Modify: `package.json` (add `@supabase/supabase-js` dependency)

- [ ] **Step 1: Install the Supabase JS client**

Run: `npm install @supabase/supabase-js`
Expected: `package.json`/`package-lock.json` updated, install succeeds with no errors.

- [ ] **Step 2: Write the failing test for a missing-env-var guard**

`@supabase/supabase-js`'s `createClient` throws if given an empty URL/key, so
`getSupabaseClient()` should surface a clear error rather than a cryptic one
if env vars are missing (a common first-run mistake before Step 5 of Chunk 1
is done). Create `lib/multiplayer/supabaseClient.test.ts`:

```ts
import { getSupabaseClient } from './supabaseClient'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Restoring via plain assignment would coerce `undefined` into the string
// "undefined" (Node stringifies process.env assignments), so delete the
// key entirely when there was no original value.
function restoreEnv(): void {
  if (originalUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  }

  if (originalKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  }
}

describe('getSupabaseClient', () => {

  afterEach(() => {
    restoreEnv()
    jest.resetModules()
  })

  it('throws a clear error when env vars are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSupabaseClient: freshGetSupabaseClient } = require('./supabaseClient')

    expect(() => freshGetSupabaseClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('returns the same client instance on repeated calls (singleton)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSupabaseClient: freshGetSupabaseClient } = require('./supabaseClient')

    expect(freshGetSupabaseClient()).toBe(freshGetSupabaseClient())
  })
})

describe('ensureAnonymousSession', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  afterEach(() => {
    restoreEnv()
    jest.resetModules()
    jest.restoreAllMocks()
  })

  it('reuses an existing session instead of signing in again', async () => {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supabaseModule = require('./supabaseClient')
    const client = supabaseModule.getSupabaseClient()
    const getSessionSpy = jest
      .spyOn(client.auth, 'getSession')
      .mockResolvedValue({ data: { session: { user: { id: 'existing-uid' } } } } as never)
    const signInSpy = jest.spyOn(client.auth, 'signInAnonymously')

    const uid = await supabaseModule.ensureAnonymousSession()

    expect(uid).toBe('existing-uid')
    expect(getSessionSpy).toHaveBeenCalled()
    expect(signInSpy).not.toHaveBeenCalled()
  })

  it('signs in anonymously when there is no existing session', async () => {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supabaseModule = require('./supabaseClient')
    const client = supabaseModule.getSupabaseClient()
    jest.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: null } } as never)
    jest
      .spyOn(client.auth, 'signInAnonymously')
      .mockResolvedValue({ data: { user: { id: 'new-uid' } }, error: null } as never)

    const uid = await supabaseModule.ensureAnonymousSession()

    expect(uid).toBe('new-uid')
  })

  it('throws when sign-in fails', async () => {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supabaseModule = require('./supabaseClient')
    const client = supabaseModule.getSupabaseClient()
    jest.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: null } } as never)
    jest
      .spyOn(client.auth, 'signInAnonymously')
      .mockResolvedValue({ data: { user: null }, error: { message: 'network down' } } as never)

    await expect(supabaseModule.ensureAnonymousSession()).rejects.toThrow(/network down/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest lib/multiplayer/supabaseClient.test.ts`
Expected: FAIL — `Cannot find module './supabaseClient'`.

- [ ] **Step 4: Implement `supabaseClient.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

/**
 * Lazily creates (and caches) the single Supabase client instance used by
 * the multiplayer feature. Reads config from env vars so both local dev
 * (.env.local) and Vercel (project env vars) work without code changes.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase config: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see supabase/README.md).',
    )
  }

  cachedClient = createClient(url, anonKey)
  return cachedClient
}

/**
 * Ensures the current browser has a Supabase anonymous-auth session,
 * signing in if needed. The SDK persists the resulting session (and its
 * auth.uid()) in localStorage automatically, which is what lets a reload
 * be recognized as the same player later.
 */
export async function ensureAnonymousSession(): Promise<string> {
  const client = getSupabaseClient()
  const { data: sessionData } = await client.auth.getSession()

  if (sessionData.session?.user.id) {
    return sessionData.session.user.id
  }

  const { data, error } = await client.auth.signInAnonymously()

  if (error || !data.user) {
    throw new Error(`Failed to start an anonymous Supabase session: ${error?.message ?? 'unknown error'}`)
  }

  return data.user.id
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/multiplayer/supabaseClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/multiplayer/supabaseClient.ts lib/multiplayer/supabaseClient.test.ts
git commit -m "Add Supabase client init and anonymous-auth helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 3: `lib/multiplayer/roomCode.ts` — room code generation + collision retry

**Files:**
- Create: `lib/multiplayer/roomCode.ts`
- Test: `lib/multiplayer/roomCode.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/multiplayer/roomCode.test.ts`:

```ts
import { createRoomWithRetry, generateRoomCode } from './roomCode'

describe('generateRoomCode', () => {
  it('returns a 5-digit numeric string', () => {
    const code = generateRoomCode(() => 0.123456)

    expect(code).toMatch(/^\d{5}$/)
  })

  it('is deterministic for a given rng', () => {
    const rng = () => 0.5
    expect(generateRoomCode(rng)).toBe(generateRoomCode(rng))
  })
})

describe('createRoomWithRetry', () => {
  it('returns the code from the first successful attempt', async () => {
    const attemptCodes: string[] = []
    const insertRoom = jest.fn(async (code: string) => {
      attemptCodes.push(code)
      return { ok: true as const }
    })

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(result).toEqual({ ok: true, code: attemptCodes[0] })
    expect(insertRoom).toHaveBeenCalledTimes(1)
  })

  it('retries up to 5 times on collision, then gives up', async () => {
    const insertRoom = jest.fn(async () => ({ ok: false as const, reason: 'collision' as const }))

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(insertRoom).toHaveBeenCalledTimes(5)
    expect(result).toEqual({ ok: false, reason: 'exhausted-retries' })
  })

  it('succeeds on a later attempt after earlier collisions', async () => {
    let call = 0
    const insertRoom = jest.fn(async () => {
      call += 1
      return call < 3 ? { ok: false as const, reason: 'collision' as const } : { ok: true as const }
    })

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(result.ok).toBe(true)
    expect(insertRoom).toHaveBeenCalledTimes(3)
  })

  it('propagates a non-collision failure immediately without retrying', async () => {
    const insertRoom = jest.fn(async () => ({ ok: false as const, reason: 'network-error' as const }))

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(insertRoom).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: false, reason: 'network-error' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/multiplayer/roomCode.test.ts`
Expected: FAIL — `Cannot find module './roomCode'`.

- [ ] **Step 3: Implement `roomCode.ts`**

```ts
const MAX_ATTEMPTS = 5

/**
 * Generates a random 5-digit numeric room code, e.g. "04213".
 * Zero-padded so the result is always exactly 5 characters.
 */
export function generateRoomCode(rng: () => number = Math.random): string {
  const value = Math.floor(rng() * 100000)
  return value.toString().padStart(5, '0')
}

export type InsertRoomResult =
  | { ok: true }
  | { ok: false; reason: 'collision' | 'network-error' }

export type CreateRoomResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'exhausted-retries' | 'network-error' }

/**
 * Generates a room code and attempts to insert a room row via the supplied
 * `insertRoom` callback (expected to attempt a unique-constrained insert and
 * report back whether it collided). Retries with a fresh code up to
 * MAX_ATTEMPTS times on a 'collision' result; any other failure reason is
 * propagated immediately without retrying, since retrying wouldn't help.
 */
export async function createRoomWithRetry(
  insertRoom: (code: string) => Promise<InsertRoomResult>,
  rng: () => number = Math.random,
): Promise<CreateRoomResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode(rng)
    const result = await insertRoom(code)

    if (result.ok) {
      return { ok: true, code }
    }

    if (result.reason !== 'collision') {
      return { ok: false, reason: result.reason }
    }
  }

  return { ok: false, reason: 'exhausted-retries' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/multiplayer/roomCode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/multiplayer/roomCode.ts lib/multiplayer/roomCode.test.ts
git commit -m "Add room code generation and collision-retry helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 4: `deal_room` equivalence check (manual/scripted verification)

This chunk verifies the SQL `deal_room` function's ace-guarantee logic
matches the spec (each side gets exactly 2 Aces, 16 cards, no
duplicates/omissions) — this can't run inside the Jest suite (it needs a
live Postgres/Supabase connection), so it's a manual verification script run
once against the project's Supabase instance, not part of `npm test`.

**Files:**
- Create: `scripts/verify-deal-room.mjs`

- [ ] **Step 1: Write the verification script**

The script needs **two separate anonymous sessions** (one per simulated
player), since `player_hands` rows are only readable by their own
`auth.uid()` — a single client can never read both hands, by design. It
creates a room as "player A", joins it as "player B" via `join_room`, deals
via `deal_room`, then has each session read its own `player_hands` row to
check the invariants, and finally deletes the room (cascades to
`player_hands` via the FK) to avoid leaving test data behind.

```js
// One-off manual verification script for the deal_room()/join_room()
// Postgres functions. Usage: node scripts/verify-deal-room.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the
// environment (e.g. `set -a; source .env.local; node scripts/verify-deal-room.mjs`).
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.')
  process.exit(1)
}

const RUNS = 20
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
const POWER_BY_RANK = { '7': 1, '8': 2, '9': 3, '10': 4, J: 5, Q: 6, K: 7, A: 8 }
const CANONICAL_DECK_IDS = new Set(
  SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}-${suit}`)),
)

function assertValidHand(cards, label) {
  if (!Array.isArray(cards) || cards.length !== 16) {
    throw new Error(`${label}: expected 16 cards, got ${cards?.length}`)
  }

  const aceCount = cards.filter((card) => card.rank === 'A').length
  if (aceCount !== 2) {
    throw new Error(`${label}: expected exactly 2 Aces, got ${aceCount}`)
  }

  const ids = new Set(cards.map((card) => card.id))
  if (ids.size !== 16) {
    throw new Error(`${label}: duplicate card ids found`)
  }

  for (const card of cards) {
    if (!CANONICAL_DECK_IDS.has(card.id)) {
      throw new Error(`${label}: unknown card id ${card.id}`)
    }

    if (!SUITS.includes(card.suit) || !RANKS.includes(card.rank)) {
      throw new Error(`${label}: malformed card ${JSON.stringify(card)}`)
    }

    if (card.power !== POWER_BY_RANK[card.rank]) {
      throw new Error(`${label}: wrong power for ${card.rank}: ${card.power}`)
    }
  }
}

/**
 * Confirms the two hands together form exactly the canonical 32-card deck
 * (no card missing, none duplicated across hands) — assertValidHand already
 * checked each hand individually has no internal duplicates/unknown ids.
 */
function assertHandsFormFullDeck(handA, handB) {
  const combinedIds = new Set([...handA.map((card) => card.id), ...handB.map((card) => card.id)])

  if (combinedIds.size !== 32) {
    throw new Error(`Combined hands: expected 32 unique cards, got ${combinedIds.size}`)
  }

  for (const id of CANONICAL_DECK_IDS) {
    if (!combinedIds.has(id)) {
      throw new Error(`Combined hands: missing card ${id}`)
    }
  }
}

async function runOnce(runIndex) {
  // Two independent clients/sessions = two independent "browsers".
  const clientA = createClient(url, anonKey)
  const clientB = createClient(url, anonKey)
  const { data: authA, error: authAError } = await clientA.auth.signInAnonymously()
  if (authAError) throw authAError
  const { data: authB, error: authBError } = await clientB.auth.signInAnonymously()
  if (authBError) throw authBError

  // Vary the code per run with a random suffix-free 5-digit value derived
  // from Date.now() so a prior failed run's leftover row (see the `finally`
  // cleanup below) can't collide with this run's code.
  const code = `${(Date.now() + runIndex) % 100000}`.padStart(5, '0')

  const { data: room, error: insertError } = await clientA
    .from('rooms')
    .insert({ code, status: 'waiting', player_a_uid: authA.user.id })
    .select()
    .single()
  if (insertError) throw insertError

  let roomId = room.id

  try {
    const { data: joinResult, error: joinError } = await clientB.rpc('join_room', {
      p_code: code,
      p_nickname: 'Player B',
    })
    if (joinError) throw joinError

    roomId = joinResult[0].room_id

    // Matches the real lifecycle: it's player B's client that wins the
    // 'waiting' -> 'dealing' race (via join_room) and is therefore the one
    // responsible for calling deal_room, per the Room Lifecycle section.
    const { error: dealError } = await clientB.rpc('deal_room', { p_room_id: roomId })
    if (dealError) throw dealError

    const { data: handA, error: handAError } = await clientA
      .from('player_hands')
      .select('available')
      .eq('room_id', roomId)
      .eq('player_uid', authA.user.id)
      .single()
    if (handAError) throw handAError

    const { data: handB, error: handBError } = await clientB
      .from('player_hands')
      .select('available')
      .eq('room_id', roomId)
      .eq('player_uid', authB.user.id)
      .single()
    if (handBError) throw handBError

    assertValidHand(handA.available, `Run ${runIndex} player A`)
    assertValidHand(handB.available, `Run ${runIndex} player B`)
    assertHandsFormFullDeck(handA.available, handB.available)
  } finally {
    // Always attempt cleanup, even on assertion failure, so a rerun doesn't
    // collide with this run's leftover row.
    const { error: deleteError } = await clientA.from('rooms').delete().eq('id', roomId)
    if (deleteError) throw deleteError
  }
}

for (let i = 0; i < RUNS; i += 1) {
  await runOnce(i)
}

console.log(`OK: ${RUNS} deal_room() runs each produced two disjoint 16-card hands with exactly 2 Aces each.`)
```

- [ ] **Step 2: Run it against the real Supabase project (with the user)**

Run (after loading `.env.local` into the shell):
`node scripts/verify-deal-room.mjs`
Expected: `OK: 20 deal_room() runs each produced two disjoint 16-card hands with exactly 2 Aces each.`

If this fails, go back to Chunk 1 Step 3's SQL and fix the `deal_room`
function before proceeding to the next plan (gameplay sync depends on this
being correct).

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-deal-room.mjs
git commit -m "Add deal_room equivalence verification script

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification for this plan

- [ ] Run: `npm test` — expected: all existing tests plus the new
  `supabaseClient.test.ts`/`roomCode.test.ts` tests pass, nothing broken.
- [ ] Run: `npm run build` — expected: clean build (env vars are optional at
  build time since `getSupabaseClient` only throws when actually called).
- [ ] Run: `npm run lint` — expected: no errors.
- [ ] Confirm with the user that Supabase project creation + migrations +
  env vars (local and Vercel) are all done before starting the follow-up
  gameplay-sync plan, since that plan assumes this backend already exists
  and is reachable.

This plan intentionally stops here — it does not touch any UI or the
gameplay hook. The next plan (`docs/superpowers/plans/2026-08-15-multiplayer-gameplay-sync.md`,
to be written next) builds `roomSync.ts`, `useMultiplayerGameState.ts`, and
the lobby/menu UI on top of this foundation.
