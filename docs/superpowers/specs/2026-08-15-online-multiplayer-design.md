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
  full form.
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

## Data Model

New Supabase Postgres table, `rooms`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | internal id |
| `code` | text, unique | the 5-digit numeric room code shown/shared, e.g. `"48213"` |
| `version` | integer | optimistic concurrency counter, starts at 0 |
| `status` | text | `waiting` \| `playing` \| `finished` |
| `created_at` | timestamptz | for cleanup of stale rooms (future housekeeping, not implemented now) |
| `player_a_nickname` | text, nullable | set when room is created |
| `player_b_nickname` | text, nullable | set when second player joins |
| `attacker_side` | text | `'a'` \| `'b'` |
| `public_state` | jsonb | see shape below |
| `winner` | text, nullable | `'a'` \| `'b'` \| null |

`public_state` JSON shape (mirrors the relevant subset of the existing
`GameState`/`Army` types in `lib/game/types.ts`, but with **counts only**
for undisclosed cards):

```ts
{
  playerA: { availableCount: number; resting: { roundsRemaining: number }[] /* no card identity */ },
  playerB: { availableCount: number; resting: { roundsRemaining: number }[] },
  phase: 'selecting' | 'combat' | 'round-result' | 'game-over',
  combat: {
    // battlefield cards revealed so far are full Card objects (public once revealed)
    revealedAttackerCards: Card[],
    resolvedDuels: ResolvedDuel[], // as today — includes real card identities, since they're revealed
    // counts of cards not yet revealed this round, to render face-down placeholders
    attackerSlotsRemaining: number,
    defenderSlotsSubmitted: number, // has defender committed their pool yet? (identities stay local until each is revealed)
  } | null,
}
```

Notably: the **defender's chosen 3 cards** are not written to `public_state`
as full identities when first submitted — only a flag that the defender has
committed, and a count. As each duel is revealed in sequence, the specific
defending card used for that duel becomes part of `resolvedDuels` (already
public, matches existing single-player `ResolvedDuel` shape). Same logic
applies to a random attacker's 3 drawn cards: initially only a count is
shared; identities appear in `resolvedDuels` as each is revealed.

## Room Lifecycle

1. Player A clicks "Hrát s kamarádem online" → "Založit hru", enters a
   nickname. Client generates a random 5-digit numeric code (checked for
   uniqueness against `rooms.code` via a Supabase query; regenerate on
   collision — extremely unlikely with a 5-digit space but handled).
   Inserts a `rooms` row with `status = 'waiting'`.
2. Player A shares the code (shown large on screen, with a copy button).
3. Player B clicks "Hrát s kamarádem online" → "Připojit se", enters the
   code + a nickname. Client looks up the row by `code`; if `status !=
   'waiting'`, shows an error ("místnost už je plná nebo hra skončila").
   Otherwise sets `player_b_nickname`, flips `status = 'playing'`.
4. Once `status = 'playing'`, both clients independently: build the full
   32-card deck, shuffle (using a **shared seed** agreed via the room row,
   see below), deal with the PvP ace-guarantee rule, and locally split into
   "my private army" (kept in memory + localStorage) vs. "opponent army"
   (counts only, written to `public_state`).
   - **Shared shuffle seed**: to ensure both clients deal the *same* 32-card
     partition without transmitting card identities, Player A (room
     creator) generates a random seed integer at deck-creation time and
     writes it into the room row (e.g. `deck_seed` column) before dealing.
     Both clients then run the exact same seeded-shuffle algorithm
     (deterministic PRNG) over the same canonical card order, guaranteeing
     both derive identical hands for "player A" and "player B" without
     either side ever transmitting the other's cards.
5. Attacker for round 1 is decided by a coin flip using the same seed
   (deterministic from `deck_seed`, e.g. `deck_seed % 2`).
6. Game proceeds per existing rules; `public_state` is updated after each
   player action (see Sync Protocol).
7. On win, `status = 'finished'`, `winner` set; both clients show the
   existing game-over UI.

## Sync Protocol (per round)

This follows the existing single-player round structure exactly
(`lib/game/state.ts` functions are reused as-is); only *what gets persisted
publicly vs. kept private* differs:

1. **Attacker selects cards** (random if NPC-style role, i.e. always random
   in PvP per existing attacker rule — attacker never freely chooses, cards
   are randomly drawn from their own available pool by their own client).
   Attacker's client writes `combat.attackerSlotsRemaining = N` (count
   only) to `public_state`, bumps `version`.
2. **Defender selects cards** (free choice from their own available pool,
   as today). Defender's client writes a "defender committed" flag + count
   to `public_state` (not identities), bumps `version`.
3. Once both are committed, either client can trigger "reveal next attacker
   card" (deterministically the next in the pre-agreed shuffle order); that
   client writes the revealed card into `public_state.combat.revealedAttackerCards`
   and appends it, bumps `version`.
4. The defender's client (whichever browser owns the defending army) then
   computes/sends the actual defending card used for this duel (using
   existing `assignDefenderCard`/`finalizeCombat` logic locally), appends
   the resulting `ResolvedDuel` (both card identities + winner) to
   `public_state.combat.resolvedDuels`, bumps `version`. Both clients apply
   `lib/game` capture logic locally to update their own idea of both
   armies (their own precisely, opponent's by count only).
5. Repeat 3–4 until all attacker slots for the round are revealed and
   resolved (including tie-chaining, unchanged from existing rules).
6. Round-result summary is derived locally by both clients from
   `resolvedDuels` (same as existing single-player `buildRoundResultCards`).
   Round-end processing (`processRoundEnd`: age resting cards, add winners,
   swap attacker/defender roles, check win) is computed locally by both
   clients and the resulting counts are written to `public_state`, bumps
   `version`.
7. If `determineWinner` finds a winner, room `status` and `winner` are set.

Any write uses the optimistic-concurrency guard (`WHERE version = expected`).
On conflict, the client refetches and, if its intended action is still
valid (e.g., it was about to reveal the next card and that's still the next
step), retries; if the action is now stale (opponent already did it), it
simply adopts the new state.

## Reconnection & Persistence

- `public_state`, `status`, `winner`, `attacker_side`, `deck_seed` all live
  in Supabase Postgres — surviving any client disconnect/reload.
- Each browser persists, in `localStorage`, keyed by room code: a random
  **player token** (generated at room-create/join time, used to tell the
  two browsers apart on reconnect — "am I player A or B in this room?") and
  its own full private army state (available + resting card identities).
- On reload, a client: reads room code + player token from `localStorage`,
  fetches the current `rooms` row from Supabase, determines whether it's
  player A or B from the token, restores its own private army from
  `localStorage`, and resubscribes to Realtime for further updates.
- If `localStorage` is cleared or the game is opened on a different
  device, reconnection to that specific game is not possible (explicitly
  accepted limitation — see Non-goals).
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
  from env vars).
- `lib/multiplayer/roomCode.ts` — room code generation + collision check.
- `lib/multiplayer/seededShuffle.ts` — deterministic seeded shuffle
  (separate from the existing `Math.random`-based `createDeck`/`dealHands`,
  or an overload accepting a seeded RNG — existing `dealHands`/`createDeck`
  in `lib/game/deck.ts` already accept an `rng: () => number` parameter per
  the technical notes, so this likely reuses that hook with a seeded PRNG
  implementation).
- `lib/multiplayer/roomSync.ts` — reads/writes `public_state` with
  optimistic concurrency, wraps Supabase Realtime subscription.
- `hooks/useMultiplayerGameState.ts` — mirrors `hooks/useGameState.ts`'s
  public interface/shape as closely as possible so `GameBoard` and other
  existing presentational components need minimal/no changes, but sources
  its state from the room-sync layer instead of pure local state +
  localStorage.
- `app/page.tsx` (or a new route e.g. `app/online/[code]/page.tsx`) — new
  main-menu / room-create / room-join screens; existing single-player page
  content becomes one branch of this menu.
- New Supabase project setup (user will need help with this — creating the
  project, running the `rooms` table migration/SQL, obtaining env vars for
  Vercel).

## Testing Strategy

- Unit tests for `lib/multiplayer/seededShuffle.ts` (determinism: same seed
  always produces the same partition/order).
- Unit tests for `lib/multiplayer/roomSync.ts` reducers/merge logic (public
  state + private state combination produces the same `GameState` shape
  consumable by existing `lib/game/*` functions).
- Unit tests for optimistic-concurrency conflict handling (simulate a
  stale-version write, assert refetch-and-reconcile behavior).
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
