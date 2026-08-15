# Online Multiplayer (v0.4) — Design Spec

## Status
Draft — pending spec review and user approval.

## Context

The game currently supports a single player vs. NPC, difficulty levels
(Easy/Normal/Expert), and fully local, client-only state (no backend). This
spec adds a second mode: **synchronous online multiplayer for two human
players**, joined via a short room code, running alongside (not replacing)
the existing single-player mode.

The player already runs a related project ("levelup") on Vercel using
Next.js + Prisma + Supabase (Postgres) + web-push, but with no realtime
transport. This project will introduce Supabase (Postgres + Realtime) purely
for this multiplayer feature; the existing single-player mode remains
100% client-only and unaffected.

## Goals

- Two human players can play a full match of the existing battle-card game
  rules against each other, in real time, from separate devices/browsers.
- Joining is as simple as sharing a 5-digit numeric room code.
- No accounts: players identify only by a nickname they type when
  creating/joining a room.
- If a player disconnects, the game waits indefinitely; reconnecting via the
  same room code **on the same browser/device** resumes the game.
- Existing single-player vs. NPC mode (with difficulty levels) is unchanged
  and still selectable from a main menu.
- Reuse all existing pure game-logic modules (`lib/game/*`) unmodified.

## Non-goals (out of scope for this spec)

- Cross-device reconnect (resuming a game from a different browser/device
  than the one you started on).
- User accounts, login, game history, statistics.
- Asynchronous play (taking turns hours/days apart).
- Spectator mode, more than 2 players, matchmaking/lobbies beyond direct
  room-code sharing.
- Anti-cheat guarantees beyond casual trust between friends/family (see
  Trust Model below). This is explicitly **not** hardened against a
  determined cheater using browser dev tools.
- Changing any core combat/rest/win rules. The only rule difference from
  single-player is described in "PvP Ace Guarantee" below.

## Trust Model (important, explicit)

This feature uses a **"trusted peer"** architecture, not a server-authoritative
one. Rationale: this game is intended for friends/family (e.g., the user and
their son), not strangers or competitive play, and a fully server-authoritative
model would require porting all of `lib/game/*` to run server-side — a much
larger undertaking for little practical benefit in this context.

Concretely:
- Each player's browser is the **sole holder** of the exact identity of that
  player's own unplaced cards (their `available` army and the identities of
  cards in their `resting` area). This data **never leaves that browser** in
  full form once the game is underway.
- **Exception — the initial deal.** Randomly splitting a 32-card deck into
  two private 16-card hands (with the ace-guarantee rule) is a case where
  *someone* has to see both hands at the moment of dealing. Rather than
  have either player's browser compute the full split (which would let that
  browser's memory/devtools reveal the opponent's entire hand for the whole
  game), this one step is delegated to a minimal **Supabase Postgres RPC
  function** (`deal_room(room_id)`, `SECURITY DEFINER`, written in
  PL/pgSQL). It runs once, server-side, at the moment the room transitions
  to `playing`: it shuffles, applies the ace-guarantee rule, writes each
  player's private hand into the RLS-protected `player_hands` table (see
  Data Model), and writes only counts into the room's public state. Neither
  client ever receives the other's hand — the function's result set is
  never returned to any client, only the two private rows are written.
  This is the **only** server-computed game-rule logic in this feature;
  everything after dealing (combat, rest, win detection) remains
  trusted-peer as described above.
- Only **public information** is synced between the two browsers via
  Supabase: whose turn/role it is, how many cards each side has available
  and resting (with per-resting-card countdown), which cards have been
  **revealed** on the battlefield so far this round, and the outcome of each
  resolved duel (which specific cards were involved and who won — this
  becomes public precisely because it was just revealed in combat).
- All game-rule computation (who wins a duel, aging rest cards, win
  condition) is done by each browser **locally**, using the unmodified pure
  functions in `lib/game/*`, applied to the combination of (a) synced public
  state and (b) that browser's own private card data. Because these
  functions are pure and deterministic, both browsers computing over the
  same effective inputs will always agree on the result — no single
  "host"/server needs to arbitrate.
- **Known limitation**: a technically sophisticated player could use browser
  developer tools to fabricate a false result for an action only they are
  supposed to compute honestly (e.g., claim a defense card they don't
  actually hold, or misreport a duel outcome). This is an accepted risk for
  this casual-use case and is explicitly out of scope to prevent. If this
  project ever needs to support less-trusted opponents, a
  server-authoritative rewrite (moving `lib/game/*` execution to a backend)
  would be a separate future project.

## PvP Ace Guarantee

Unlike single-player (where guarantee only applies to the human vs. an NPC
that gets whatever's left), in PvP **both** players independently get exactly
2 guaranteed Aces in their starting 16-card hand. This requires 4 Aces total
across both hands — coincidentally exactly the number of Aces in a 32-card
deck (one per suit), so this is only possible because the deck always has
exactly 4 Aces and both hands get exactly half. Rest-area duration is the
default (2 rounds, same as Easy/Normal). There is no duel/round redo
mechanic in PvP (that mechanic is Easy-difficulty-only, single-player vs NPC).

## Architecture Overview

```
Browser A (Player 1)          Supabase                 Browser B (Player 2)
------------------------      ------------------      ------------------------
Private state:                 rooms table              Private state:
 - own available army    <--   (public state,     -->    - own available army
 - own resting army           realtime-synced            - own resting army
                              via Postgres          
Local pure game-logic         Realtime channel)      Local pure game-logic
(lib/game/*, unmodified)   <---------------------->  (lib/game/*, unmodified)
```

- **Supabase Postgres**: one row in a `rooms` table per game room, holding
  only the public state (see Data Model below).
- **Supabase Realtime**: both browsers subscribe to Postgres change events
  on their room's row; any write is pushed to both browsers automatically.
- **Optimistic concurrency**: the `rooms` row has a `version` integer.
  Writes include a `WHERE version = <expected>` guard and increment
  `version`; a failed write (0 rows affected) means the other player wrote
  first — the writer refetches the latest row and reconciles (recomputes
  its intended action against the new state, or shows a "please retry"
  message if the action no longer makes sense, e.g. it's no longer that
  player's turn).
- **Supabase Anonymous Auth**: each browser signs in via
  `supabase.auth.signInAnonymously()` on first use. This is a real Supabase
  feature that creates a stable `auth.uid()` for that browser with no
  credentials/UI, and the Supabase client SDK persists the resulting
  session in `localStorage` automatically. This single mechanism solves two
  problems at once: (1) it's the identity used by Postgres Row Level
  Security policies to scope `player_hands` access (see Data Model), and
  (2) it's what a reconnecting browser presents to prove which side (A or
  B) it is, since the SDK restores the same `auth.uid()` from its persisted
  session on reload.
- **Single-writer-per-step rule**: to eliminate any ambiguity about which
  client is allowed to write which event (see Sync Protocol), exactly one
  side is authoritative for each step: the **attacker's** client is the only
  one that reveals attacker cards (it already knows all of its own cards'
  identities — "random attack" only means the attacker doesn't get to
  *choose* which 3 are drawn, not that the attacker's own client is unaware
  of them); the **defender's** client is the only one that assigns/reveals
  which of its own committed defense cards resolves the current duel. No
  step is ever described as "either client may perform it."

## Data Model

New Supabase Postgres table, `rooms`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | internal id |
| `code` | text, unique | the 5-digit numeric room code shown/shared, e.g. `"48213"` |
| `version` | integer | optimistic concurrency counter, starts at 0 |
| `status` | text | `waiting` \| `dealing` \| `playing` \| `finished` |
| `created_at` | timestamptz | for cleanup of stale rooms (future housekeeping, not implemented now) |
| `player_a_nickname` | text, nullable | set when room is created |
| `player_b_nickname` | text, nullable | set when second player joins |
| `player_a_uid` | uuid, nullable | Supabase anonymous-auth `auth.uid()` of player A's browser, set at create time |
| `player_b_uid` | uuid, nullable | Supabase anonymous-auth `auth.uid()` of player B's browser, set at join time |
| `attacker_side` | text | `'a'` \| `'b'` |
| `public_state` | jsonb | see shape below |
| `winner` | text, nullable | `'a'` \| `'b'` \| null |

**RLS policies on `rooms`** (this table holds no private card data, so
policies only need to prevent unauthorized *writes*, not reads):
- `SELECT`: allowed for any anon session (needed so an unauthenticated
  browser can look up a room by `code` before it has joined).
- `INSERT`: allowed for any anon session (room creation).
- `UPDATE`: allowed only when
  `auth.uid() IN (player_a_uid, player_b_uid) OR player_b_uid IS NULL` —
  the `player_b_uid IS NULL` clause is what permits the join step (an
  as-yet-unrecognized second player claiming the open seat); once both
  seats are filled, only the two recognized participants may update the
  row.

Second table, `player_hands` — one row per player per room, holding the
**private** data. Protected by Row Level Security: `SELECT`/`UPDATE`
allowed only where `auth.uid() = player_uid`, so a player's own client can
query its own row but never the opponent's. `INSERT` is not exposed to
clients at all — rows are only ever created by the `SECURITY DEFINER`
`deal_room` function (see below), which bypasses RLS by design.

| Column | Type | Notes |
|---|---|---|
| `room_id` | uuid, FK → `rooms.id` | |
| `player_uid` | uuid | matches `rooms.player_a_uid` or `player_b_uid` |
| `available` | jsonb | array of `Card` — this player's unplaced army |
| `resting` | jsonb | array of `RestingCard` — this player's resting army |
| `pending_attack_queue` | jsonb, nullable | when this player is attacker this round: the full ordered array of `Card` drawn for the round, including cards not yet revealed to the opponent. `null` when this player isn't the current round's attacker, or between rounds. |
| `pending_defender_pool` | jsonb, nullable | when this player is defender this round: the full array of `Card` they committed as their defense pool, including cards not yet used to resolve a duel. `null` when this player isn't the current round's defender, or between rounds. |

Primary key: (`room_id`, `player_uid`).

These two `pending_*` columns exist specifically so a client can survive a
reload **mid-round**: without them, a reloaded client would have lost track
of exactly which of its own cards were drawn/committed for the in-progress
round (only `resolvedDuels` in `public_state` would be recoverable, which
is incomplete for an unfinished round). On reload, a client restores its
full `CombatState` by combining `public_state.combat` (revealed/resolved
cards) with its own `pending_attack_queue`/`pending_defender_pool` (its own
not-yet-revealed cards) — exactly mirroring the existing single-player
`CombatState` shape (`attackerQueue`, `defenderPool`, `revealedCard`,
`pendingTies`, `resolvedDuels`) but split across the public/private
boundary. Both `pending_*` columns are cleared back to `null` as part of
the `processRoundEnd` write described in Sync Protocol step 6.

`public_state` JSON shape (mirrors the relevant subset of the existing
`GameState`/`CombatState` types in `lib/game/types.ts`. Note: the existing
`GamePhase` type includes a `'round-end'` value, but the current
single-player code never actually sets it — `lib/game/state.ts` only ever
transitions between `'selecting'`, `'combat'`, and `'game-over'`; the
"round result summary" screen is a purely client-side/hook-level overlay
computed in `hooks/useGameState.ts` from a finished-but-not-yet-processed
`combat` state, not a distinct `GameState.phase` value. Multiplayer,
however, has two independent viewers who must each explicitly dismiss the
summary before the round actually advances (so one player dismissing
doesn't yank the summary away from the other) — so `public_state.phase`
introduces one **new** value not present in the single-player enum,
`'round-summary'`, to represent this a two-viewer synchronization need
that doesn't exist in single-player):

```ts
{
  playerA: { availableCount: number; resting: { roundsRemaining: number }[] /* no card identity */ },
  playerB: { availableCount: number; resting: { roundsRemaining: number }[] },
  phase: 'selecting' | 'combat' | 'round-summary' | 'game-over',
  combat: {
    attackerSlotsTotal: number,        // how many attacker cards this round (2 or 3)
    attackerCardsRevealed: Card[],     // full Card objects, public once revealed, in reveal order
    revealedCard: Card | null,         // the currently-revealed-but-unresolved attacker card, if any
    defenderCommitted: boolean,        // has defender submitted its 3-card pool? (identities stay private until each resolves)
    pendingTies: Duel[],               // mirrors CombatState.pendingTies — public once both cards in the tie are known
    resolvedDuels: ResolvedDuel[],     // as today — includes real card identities, since they're revealed
  } | null,
  roundSummaryDismissedBy: { a: boolean; b: boolean }, // only meaningful while phase === 'round-summary'
}
```

When `isCombatFinished` becomes true (all duels resolved, no pending
ties), either client transitions `public_state.phase` to
`'round-summary'` (both compute the same `resolvedDuels`, so this is safe
regardless of which client's write wins the race) and both render the
round-result summary locally (same `buildRoundResultCards` logic as
single-player) from `public_state.combat.resolvedDuels`. Each client, when
its own player clicks "Continue", sets its own flag in
`roundSummaryDismissedBy` (`{a: true}` or `{b: true}`, never touching the
other's flag) via a normal optimistic-concurrency update. Once **both**
flags are true (detected by whichever client's update makes it so, which
may be either — both are computing the same `processRoundEnd` result from
the same prior state, so this is safe), that client also writes the
`processRoundEnd` result (aged rest, new resting winners, attacker/defender
swap, phase back to `'selecting'` or `'game-over'` if `determineWinner`
finds a winner, and `roundSummaryDismissedBy` reset to `{a: false, b:
false}`) in the same update.

Notably: the **defender's chosen defense pool** is not written to
`public_state` as full identities when first submitted — only the
`defenderCommitted` flag. As each duel is revealed and resolved in
sequence, the specific defending card used for that duel becomes part of
`resolvedDuels` (already public, matches existing single-player
`ResolvedDuel` shape) and/or `pendingTies` (for chained ties awaiting more
duels before resolution, matching existing `CombatState.pendingTies`
semantics). This `combat` object is a complete enough snapshot that a
client reloading mid-round can reconstruct exactly where the round stands
without needing anything beyond `public_state` + its own `player_hands`
row.

## Room Lifecycle

1. Player A clicks "Hrát s kamarádem online" → "Založit hru", enters a
   nickname. Client ensures it has a Supabase anonymous-auth session
   (`supabase.auth.signInAnonymously()` if not already signed in — the SDK
   persists this session in `localStorage` automatically, no app code
   needed for that part). Client generates a random 5-digit numeric code
   and attempts to `INSERT` a `rooms` row with that `code` and
   `status = 'waiting'`, `player_a_uid = auth.uid()`. Because `code` has a
   unique constraint, a collision causes the insert to fail; the client
   regenerates a new random code and retries, up to 5 attempts, after which
   it shows an error ("nepodařilo se založit místnost, zkus to znovu").
   With a 5-digit space (100,000 codes) and only ever a handful of rooms
   `waiting`/`playing` at once, collisions are expected to be rare, but the
   retry loop makes this robust regardless.
2. Player A shares the code (shown large on screen, with a copy button).
3. Player B clicks "Hrát s kamarádem online" → "Připojit se", enters the
   code + a nickname, and similarly ensures an anonymous-auth session.
   Client looks up the row by `code`; if it doesn't exist or
   `status != 'waiting'`, shows an error ("místnost neexistuje, už je plná,
   nebo hra skončila"). Otherwise, in one update, sets
   `player_b_nickname`, `player_b_uid = auth.uid()`, and flips
   `status = 'dealing'` (guarded by `WHERE status = 'waiting'` so two
   simultaneous joiners can't both succeed — Postgres's row-level update
   guarantees only one concurrent `UPDATE ... WHERE status = 'waiting'`
   actually matches a row, even under a race).
4. Player B's client (the one whose update above actually succeeded — the
   only client that can ever observe the `'waiting' -> 'dealing'`
   transition happen as a direct result of its own write) calls the
   `deal_room(room_id)` Postgres RPC described in the Trust Model section.
   This function is written to be **idempotent and safe against being
   called more than once**: it starts a transaction, takes a row lock on
   the `rooms` row (`SELECT ... FOR UPDATE`), and immediately checks
   `status`; if `status` is no longer `'dealing'` (e.g., a retried/duplicate
   call after dealing already completed), it simply returns without doing
   anything further. Otherwise it: builds/shuffles the 32-card deck
   server-side, applies the PvP ace-guarantee rule (each side gets exactly
   2 Aces), randomly picks the starting attacker, inserts both
   `player_hands` rows, writes `attacker_side` plus hand-count-only fields
   into `rooms.public_state`, and finally flips `status = 'playing'` —
   all within the same transaction, so any other client's concurrent call
   either blocks briefly on the row lock and then sees `status = 'playing'`
   already (no-op), or never gets a chance to run concurrently at all.
   Only Player B's client needs to actually call this RPC (since it's the
   only client that can win the `'waiting' -> 'dealing'` race), but the
   function's idempotency guard means it's safe even if the client
   implementation retries the call defensively (e.g., after a network
   error where the client isn't sure if the call succeeded).
   Player A's client detects the `status = 'playing'` transition via its
   Realtime subscription. Both clients then separately query their **own**
   `player_hands` row (RLS-restricted to their own `auth.uid()`) to load
   their private army into memory + `localStorage`.

   **Recovery if Player B's client fails/disconnects between setting
   `status = 'dealing'` and the RPC call completing** (e.g., the browser
   tab is closed at exactly that moment): the room would otherwise be
   stuck in `'dealing'` forever. Either client's UI, upon observing
   `status = 'dealing'` for longer than a short fixed timeout (e.g. 5
   seconds) without progressing to `'playing'`, simply calls
   `deal_room(room_id)` itself — safe to do regardless of which client
   calls it or how many times, thanks to the RPC's idempotency guard
   described above.
5. Game proceeds per existing rules; `public_state` is updated after each
   player action (see Sync Protocol).
6. On win, `status = 'finished'`, `winner` set; both clients show the
   existing game-over UI.

## Sync Protocol (per round)

This follows the existing single-player round structure exactly
(`lib/game/state.ts` functions are reused as-is); only *what gets persisted
publicly vs. kept private* differs:

1. **Attacker selects cards** (random if NPC-style role, i.e. always random
   in PvP per existing attacker rule — attacker never freely chooses, cards
   are randomly drawn from their own available pool by their own client;
   the attacker's own client knows these identities immediately, it just
   didn't get to pick them). Attacker's client writes the drawn cards to
   its own `player_hands.pending_attack_queue` (private, full identities)
   and writes only `combat.attackerSlotsTotal = N` (count) to
   `public_state`, bumps `version`.
2. **Defender selects cards** (free choice from their own available pool,
   as today). Defender's client writes its chosen cards to its own
   `player_hands.pending_defender_pool` (private, full identities) and
   writes only `combat.defenderCommitted = true` to `public_state` (not
   identities), bumps `version`.
3. Once both are committed, the **attacker's client** (and only the
   attacker's client — see the single-writer-per-step rule in Architecture
   Overview) reveals the next attacker card: it writes that card into
   `public_state.combat.attackerCardsRevealed` (appended) and sets it as
   `combat.revealedCard`, bumps `version`.
4. The **defender's client** (and only the defender's client) then
   determines the actual defending card used for this duel (using existing
   `assignDefenderCard`/`finalizeCombat` logic locally against its own
   private pool), clears `revealedCard`, and appends the resulting
   `ResolvedDuel` (both card identities + winner) — or, for a tie, appends
   to `pendingTies` instead, matching existing `CombatState` semantics — to
   `public_state.combat`, bumps `version`. Both clients apply `lib/game`
   capture logic locally to update their own idea of both armies (their
   own precisely from `player_hands`, opponent's by count only from
   `public_state`).
5. Repeat 3–4 until all attacker slots for the round are revealed and
   resolved (including tie-chaining, unchanged from existing rules).
6. Once `isCombatFinished` is true, `public_state.phase` moves to
   `'round-summary'` (see the phase-value note in Data Model above) and
   both clients render the round-result summary locally from
   `resolvedDuels` (same as existing single-player
   `buildRoundResultCards`), each waiting for their own player to click
   "Continue". Clicking "Continue" **only** sets that player's own flag
   (`roundSummaryDismissedBy.a = true` or `.b = true`) in `public_state` —
   it does **not** touch `player_hands` yet, and it does not compute
   `processRoundEnd` yet. Each client, via its Realtime subscription, is
   watching for the moment `roundSummaryDismissedBy` becomes `{a: true, b:
   true}` (this can be observed by either client, regardless of which
   client's dismiss-write was the second/deciding one). The moment a client
   observes both flags true, it computes `processRoundEnd` **for its own
   side only** and writes the result to its **own** `player_hands` row
   (clearing `pending_attack_queue`/`pending_defender_pool`, updating
   `available`/`resting`) — each client can only ever write its own
   `player_hands` row per RLS, so this step is inherently duplicated once
   per client, which is correct and required (not a race to avoid). Only
   one of the two clients' writes to `public_state` (updating counts,
   `attacker_side` swap, phase back to `'selecting'`/`'game-over'`, and
   resetting `roundSummaryDismissedBy` to `{a: false, b: false}`) actually
   succeeds under the normal optimistic-concurrency guard; the other
   client's equivalent write simply fails its version check and is
   discarded (harmless no-op, since both computed the identical result from
   the identical prior state).
7. If `determineWinner` finds a winner, room `status` and `winner` are set.

Any write uses the optimistic-concurrency guard (`WHERE version = expected`).
On conflict, the client refetches and, if its intended action is still
valid (e.g., it was about to reveal the next card and that's still the next
step), retries; if the action is now stale (opponent already did it), it
simply adopts the new state.

## Reconnection & Persistence

- `public_state`, `status`, `winner`, `attacker_side`, `player_a_uid`,
  `player_b_uid` all live in Supabase Postgres — surviving any client
  disconnect/reload. The private `player_hands` rows likewise persist
  server-side (RLS-protected), which means a player's own hand actually
  **does not strictly need** to be duplicated into `localStorage` to
  survive a reload — it can simply be re-fetched from its own
  `player_hands` row on reconnect. `localStorage` is still used, but only
  for two small, non-sensitive things: the room `code` the browser last
  played (so it knows which room to reconnect to) and a client-side cache
  of the last-rendered state (purely as a fast-paint optimization before
  the fresh Supabase fetch resolves — never treated as the source of truth).
- The Supabase JS SDK persists the anonymous-auth session (containing
  `auth.uid()`) in `localStorage` itself, automatically, as part of its
  normal operation — this is what lets a reconnecting browser be
  recognized as "player A" or "player B" for a given room: on reload, the
  client restores its Supabase session (SDK-managed), fetches the `rooms`
  row for the last-known `code` (app-managed `localStorage` key), compares
  its restored `auth.uid()` against `player_a_uid`/`player_b_uid` on that
  row to determine its side, and queries its own `player_hands` row (RLS
  automatically permits this since it matches `auth.uid()`).
- If the Supabase anonymous-auth session or the room-code `localStorage`
  entry is cleared, or the game is opened on a different device, that
  browser can no longer be recognized as its previous side (explicitly
  accepted limitation — see Non-goals; there is deliberately no manual
  "enter your player token" recovery flow in this version).
- No explicit disconnect timeout: the game simply waits. There's no "kick
  inactive player" mechanic in this version.

## UI Changes

- New main menu screen (first thing shown, replacing the current
  auto-start-single-player behavior): two options —
  "Hrát proti počítači" (existing flow, difficulty picker) and "Hrát s
  kamarádem online" (new: "Založit hru" / "Připojit se" sub-choice).
- Room create screen: nickname input, "Založit" button, then displays the
  generated 5-digit code prominently with a copy-to-clipboard button and a
  "čekání na soupeře…" state.
- Room join screen: nickname input, 5-digit code input, "Připojit" button,
  inline error messages for invalid/full/finished room codes.
- In-game: existing board/UI is reused as-is. Add a small connection-status
  indicator (e.g. "Soupeř je odpojen, čekáme na návrat…") shown when the
  Realtime presence signal indicates the peer's channel is not currently
  connected (Supabase Realtime Presence feature) — informational only, does
  not block or time out the game.
- Existing difficulty picker, i18n (cs/en), mobile-responsive layout, and
  active-block highlighting all continue to apply within a multiplayer
  game exactly as they do in single-player, with the obvious exception that
  there's no "vs NPC" difficulty choice in the online mode.

## New/Changed Modules (implementation-level sketch, for the follow-up plan)

- `lib/multiplayer/supabaseClient.ts` — Supabase client init (URL/anon key
  from env vars) + anonymous-auth sign-in helper.
- `lib/multiplayer/roomCode.ts` — room code generation + collision-retry
  logic (up to 5 attempts on unique-constraint conflict).
- `supabase/migrations/*.sql` — `rooms` table, `player_hands` table, RLS
  policies (`auth.uid() = player_uid`), and the `deal_room(room_id)`
  `SECURITY DEFINER` PL/pgSQL function (builds/shuffles the 32-card deck,
  applies the PvP ace-guarantee rule, picks the starting attacker, inserts
  both `player_hands` rows, writes count-only fields to `rooms.public_state`).
  This function reimplements just the shuffle+ace-guarantee-deal step
  server-side in SQL; it does not need to reuse `lib/game/deck.ts` (that
  remains the client-side implementation for single-player), but its
  behavior (ace-guarantee rule, 32-card composition) must match the same
  rules and should be unit-tested (e.g., via `pgTAP` or a small Node script
  against a local Supabase instance) for equivalence.
- `lib/multiplayer/roomSync.ts` — reads/writes `public_state` with
  optimistic concurrency, wraps Supabase Realtime subscription, enforces
  the single-writer-per-step rule client-side (i.e., a client simply never
  attempts to write a step that isn't its own responsibility).
- `hooks/useMultiplayerGameState.ts` — mirrors `hooks/useGameState.ts`'s
  public interface/shape as closely as possible so `GameBoard` and other
  existing presentational components need minimal/no changes, but sources
  its state from the room-sync layer (public `rooms` row + own
  `player_hands` row) instead of pure local state + localStorage.
- `app/page.tsx` (or a new route e.g. `app/online/[code]/page.tsx`) — new
  main-menu / room-create / room-join screens; existing single-player page
  content becomes one branch of this menu.
- New Supabase project setup (user will need help with this — creating the
  project, running the `rooms`/`player_hands` migrations, creating the
  `deal_room` function, configuring RLS policies, enabling anonymous auth,
  obtaining env vars for Vercel).

## Testing Strategy

- Unit tests for `lib/multiplayer/roomCode.ts` (collision-retry logic, max
  attempts).
- Unit tests for `lib/multiplayer/roomSync.ts` reducers/merge logic (public
  state + private `player_hands` state combination produces the same
  `GameState` shape consumable by existing `lib/game/*` functions).
- Unit tests for optimistic-concurrency conflict handling (simulate a
  stale-version write, assert refetch-and-reconcile behavior).
- A small equivalence test/script for the `deal_room` SQL function's
  ace-guarantee logic (each side always gets exactly 2 Aces, 16 cards each,
  no duplicate/missing cards across both hands).
- Manual end-to-end test: two browser windows (or two devices) playing a
  full game to completion, including a deliberate disconnect/reconnect of
  one side mid-round.
- Existing single-player test suite must remain 100% passing and
  unaffected (no changes to `lib/game/*` behavior).

## Open Questions / Future Work (explicitly deferred)

- Cross-device reconnect, accounts/statistics, spectator mode, asynchronous
  play, stricter anti-cheat (server-authoritative rewrite) — all
  out of scope, listed here so they aren't silently forgotten.
- Stale/abandoned room cleanup (e.g., a cron or TTL to delete old `rooms`
  rows) is not addressed in this version; acceptable since Supabase's free
  tier storage is ample for a low-volume casual game.
