# Multiplayer Gameplay Sync & UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-side gameplay layer for online 2-player multiplayer: syncing/merging public Supabase state with each browser's own private hand, a `useMultiplayerGameState` hook that mirrors `useGameState`'s shape closely enough that the existing `GameBoard` renders it with minimal changes, and the lobby UI (main menu, create/join room screens, connection status).

**Architecture:** Builds directly on `docs/superpowers/plans/2026-08-15-multiplayer-backend-foundation.md` (must be completed and verified first — this plan assumes `rooms`/`player_hands` tables, `join_room`/`deal_room` RPCs, Realtime, and `lib/multiplayer/{supabaseClient,roomCode}.ts` already exist). All actual game-rule computation continues to happen in the unmodified `lib/game/*` pure functions; this plan only adds the "glue" that feeds them the right combination of public Supabase state + the browser's own private `player_hands` row, and writes results back per the Sync Protocol's single-writer-per-step rule.

**Tech Stack:** TypeScript, React hooks, `@supabase/supabase-js` (Realtime + Postgres), Jest, Tailwind, existing `lib/game/*` and `lib/i18n/*`.

**Reference documents (read first):**
- `docs/superpowers/specs/2026-08-15-online-multiplayer-design.md` — the full design, especially "Data Model" and "Sync Protocol" sections, which this plan implements step-for-step.
- `docs/superpowers/plans/2026-08-15-multiplayer-backend-foundation.md` — the prerequisite backend plan; re-read its `join_room`/`deal_room` signatures before starting Chunk 3.
- `lib/game/state.ts`, `lib/game/types.ts` — the pure logic and types being reused unmodified.
- `hooks/useGameState.ts` — the single-player hook whose public shape (`state`, `roundResult`, `actions.*`) this plan's `useMultiplayerGameState` should mirror as closely as possible.

---

## Chunk 1: `lib/multiplayer/types.ts` — shared TypeScript types for the sync layer

**Files:**
- Create: `lib/multiplayer/types.ts`

- [ ] **Step 1: Define the types mirroring the spec's Data Model**

These are plain type declarations (no logic to test), matching the SQL
schema from the backend plan and the `public_state` JSON shape from the
design spec's Data Model section (including the `resting` full-`Card`
correction noted in the spec):

```ts
import type { Card, CombatState as SinglePlayerCombatState, Duel, ResolvedDuel } from '@/lib/game/types'

export type RoomStatus = 'waiting' | 'dealing' | 'playing' | 'finished'
export type PlayerSlot = 'a' | 'b'

export interface PublicPlayerState {
  availableCount: number
  resting: { card: Card; roundsRemaining: number }[]
}

export interface PublicCombatState {
  attackerSlotsTotal: number
  attackerCardsRevealed: Card[]
  revealedCard: Card | null
  defenderCommitted: boolean
  pendingTies: Duel[]
  resolvedDuels: ResolvedDuel[]
}

export type PublicPhase = 'selecting' | 'combat' | 'round-summary' | 'game-over'

export interface PublicState {
  roundNumber: number
  playerA: PublicPlayerState
  playerB: PublicPlayerState
  phase: PublicPhase
  combat: PublicCombatState | null
  roundSummaryDismissedBy: { a: boolean; b: boolean }
  roundEndAppliedBy: { a: boolean; b: boolean }
}

export interface RoomRow {
  id: string
  code: string
  version: number
  status: RoomStatus
  player_a_nickname: string | null
  player_b_nickname: string | null
  player_a_uid: string | null
  player_b_uid: string | null
  attacker_side: PlayerSlot | null
  public_state: PublicState | null
  winner: PlayerSlot | null
}

export interface PlayerHandRow {
  room_id: string
  player_uid: string
  available: Card[]
  resting: { card: Card; roundsRemaining: number }[]
  pending_attack_queue: Card[] | null
  pending_defender_pool: Card[] | null
  last_applied_round: number
}

/** Re-exported for convenience so callers don't need two import sources. */
export type { SinglePlayerCombatState }
```

- [ ] **Step 2: Commit**

```bash
git add lib/multiplayer/types.ts
git commit -m "Add shared TypeScript types for multiplayer sync layer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: `lib/multiplayer/roomSync.ts` — pure merge logic + optimistic-write helper

This is the most important chunk to get right and the most testable one
(no network needed) — it's the "glue" mentioned in the Architecture
section. Two independent responsibilities, both pure/unit-testable:
(a) combining `PublicState` + one player's own private hand into a
`GameState`-shaped view that `lib/game/*` functions and `GameBoard` can
consume, and (b) a generic optimistic-concurrency write wrapper.

**Files:**
- Create: `lib/multiplayer/roomSync.ts`
- Test: `lib/multiplayer/roomSync.test.ts`

- [ ] **Step 1: Write the failing tests for `buildGameStateView`**

`buildGameStateView` takes the room's `PublicState`, the calling client's
own slot (`'a'` or `'b'`), and that client's own `PlayerHandRow`, and
produces a `GameState` (from `lib/game/types.ts`) where:
- `state.player` = the calling client's own army, built from its own
  `available`/`resting` (full identities, from `PlayerHandRow`).
- `state.npc` field name is reused structurally to mean "the opponent" —
  see Step 2's naming note — built from `PublicState`'s opponent
  `availableCount`/`resting` (real `Card`s for resting, since those are
  public; `available` is filled with `availableCount` placeholder cards
  since real identities are private and never needed by any `lib/game/*`
  function or `GameBoard` render for the *opponent's* `available` array —
  `GameBoard` only ever reads `opponentArmy.available.length`, never
  individual card identities, confirmed by reading `GameBoard.tsx`).
- `state.attackerSide` = `'player'` if `PublicState`'s attacker slot
  matches the calling client's own slot, else `'npc'` (again reusing the
  single-player `Side` union structurally: "player" = "me", "npc" = "the
  other side" — see the naming note below for why).
- `state.combat` is reconstructed from `PublicState.combat` plus, when the
  calling client is the attacker, its own `pending_attack_queue`
  (unrevealed attacker cards aren't in `PublicState.combat` at all) and,
  when it's the defender, its own `pending_defender_pool` minus whichever
  cards already appear in `resolvedDuels`/`pendingTies` (already-used
  defender cards).
- `state.phase` maps `'round-summary'` to `'combat'` for the purposes of
  feeding `lib/game/*` functions (which don't know about `'round-summary'`)
  — the hook layer (Chunk 3) is responsible for treating `'round-summary'`
  specially for UI purposes, using `PublicState.phase` directly rather than
  the mapped `GameState.phase`.

**Naming note:** `lib/game/types.ts`'s `Side = 'player' | 'npc'` and
`Army`/`GameState.player`/`GameState.npc` field names are single-player
vocabulary. Rather than fork `lib/game/*` to add a third multiplayer-only
vocabulary (which the spec's Trust Model explicitly says to avoid — reuse
`lib/game/*` unmodified), this plan reuses the same field names/union
structurally: for a multiplayer client, `'player'` always means "this
browser's own side" and `'npc'` always means "the opponent's side" —
regardless of whether the opponent is actually a human. This is an
implementation detail confined to `roomSync.ts`/`useMultiplayerGameState.ts`
and never surfaces in UI copy (the hook/UI layer translates back to
correct player-facing labels using nicknames, not "NPC").

Create `lib/multiplayer/roomSync.test.ts`:

```ts
import { buildGameStateView } from './roomSync'
import type { PlayerHandRow, PublicState } from './types'
import type { Card } from '@/lib/game/types'

function card(id: string, power = 1): Card {
  return { id, rank: '7', suit: 'hearts', power }
}

function basePublicState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    roundNumber: 1,
    playerA: { availableCount: 16, resting: [] },
    playerB: { availableCount: 16, resting: [] },
    phase: 'selecting',
    combat: null,
    roundSummaryDismissedBy: { a: false, b: false },
    roundEndAppliedBy: { a: false, b: false },
    ...overrides,
  }
}

function baseHand(overrides: Partial<PlayerHandRow> = {}): PlayerHandRow {
  return {
    room_id: 'room-1',
    player_uid: 'uid-a',
    available: [card('7-hearts'), card('8-hearts')],
    resting: [],
    pending_attack_queue: null,
    pending_defender_pool: null,
    last_applied_round: 0,
    ...overrides,
  }
}

describe('buildGameStateView', () => {
  it('maps the calling slot to state.player and the other slot to state.npc', () => {
    const view = buildGameStateView(basePublicState(), 'a', baseHand())

    expect(view.player.available).toHaveLength(2)
    expect(view.npc.available).toHaveLength(16)
  })

  it('marks the caller as attacker/defender based on attacker_side vs its own slot', () => {
    const asAttacker = buildGameStateView(
      { ...basePublicState() },
      'a',
      baseHand(),
      'a',
    )
    const asDefender = buildGameStateView(
      { ...basePublicState() },
      'a',
      baseHand(),
      'b',
    )

    expect(asAttacker.attackerSide).toBe('player')
    expect(asDefender.attackerSide).toBe('npc')
  })

  it('reconstructs combat.attackerQueue from the private pending_attack_queue when the caller is attacker', () => {
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 2,
        attackerCardsRevealed: [],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [],
      },
    })
    const hand = baseHand({ pending_attack_queue: [card('9-hearts'), card('10-hearts')] })

    const view = buildGameStateView(publicState, 'a', hand, 'a')

    expect(view.combat?.attackerQueue).toEqual([card('9-hearts'), card('10-hearts')])
  })

  it('reconstructs combat.defenderPool from pending_defender_pool minus already-resolved cards', () => {
    const defenderCardUsed = card('J-hearts', 5)
    const defenderCardRemaining = card('Q-hearts', 6)
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 2,
        attackerCardsRevealed: [card('7-hearts')],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [
          { duel: { attackerCard: card('7-hearts'), defenderCard: defenderCardUsed }, winner: 'defender' },
        ],
      },
    })
    const hand = baseHand({ pending_defender_pool: [defenderCardUsed, defenderCardRemaining] })

    const view = buildGameStateView(publicState, 'b', hand, 'a')

    expect(view.combat?.defenderPool).toEqual([defenderCardRemaining])
  })

  it('gives the opponent placeholder available cards matching only the public count', () => {
    const view = buildGameStateView(basePublicState({ playerB: { availableCount: 5, resting: [] } }), 'a', baseHand())

    expect(view.npc.available).toHaveLength(5)
  })

  it('maps round-summary phase to combat for GameState purposes', () => {
    const view = buildGameStateView(basePublicState({ phase: 'round-summary' }), 'a', baseHand())

    expect(view.phase).toBe('combat')
  })

  it('excludes already-revealed cards from the attacker own-side attackerQueue', () => {
    const revealed = card('9-hearts')
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 2,
        attackerCardsRevealed: [revealed],
        revealedCard: card('10-hearts'),
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [],
      },
    })
    const hand = baseHand({ pending_attack_queue: [revealed, card('10-hearts')] })

    const view = buildGameStateView(publicState, 'a', hand, 'a')

    expect(view.combat?.attackerQueue).toEqual([])
  })

  it('gives the defender a count-only placeholder attackerQueue matching remaining slots', () => {
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 3,
        attackerCardsRevealed: [card('9-hearts')],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [],
      },
    })

    const view = buildGameStateView(publicState, 'b', baseHand(), 'a')

    expect(view.combat?.attackerQueue).toHaveLength(2)
  })

  it('gives the attacker a count-only placeholder defenderPool matching remaining slots', () => {
    const defenderCardUsed = card('J-hearts', 5)
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 3,
        attackerCardsRevealed: [card('7-hearts')],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [
          { duel: { attackerCard: card('7-hearts'), defenderCard: defenderCardUsed }, winner: 'defender' },
        ],
      },
    })

    const view = buildGameStateView(publicState, 'a', baseHand(), 'a')

    expect(view.combat?.defenderPool).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/multiplayer/roomSync.test.ts`
Expected: FAIL — `Cannot find module './roomSync'`.

- [ ] **Step 3: Implement `buildGameStateView` in `roomSync.ts`**

```ts
import type { Army, Card, CombatState, GameState, RestingCard, Side } from '@/lib/game/types'
import type { PlayerHandRow, PlayerSlot, PublicState } from './types'

const OTHER_SLOT: Record<PlayerSlot, PlayerSlot> = { a: 'b', b: 'a' }

function placeholderCards(count: number, slotLabel: string): Card[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `hidden-${slotLabel}-${index}`,
    // Rank/suit/power are meaningless placeholders: this array only ever
    // has its .length read (opponent's real available cards are private
    // and never sent over the network).
    rank: '7',
    suit: 'hearts',
    power: 0,
  }))
}

function buildOpponentArmy(publicState: PublicState, opponentSlot: PlayerSlot): Army {
  const opponentPublic = opponentSlot === 'a' ? publicState.playerA : publicState.playerB

  return {
    available: placeholderCards(opponentPublic.availableCount, opponentSlot),
    resting: opponentPublic.resting.map((entry): RestingCard => ({
      card: entry.card,
      roundsRemaining: entry.roundsRemaining,
    })),
  }
}

function buildOwnArmy(ownHand: PlayerHandRow): Army {
  return {
    available: ownHand.available,
    resting: ownHand.resting.map((entry): RestingCard => ({
      card: entry.card,
      roundsRemaining: entry.roundsRemaining,
    })),
  }
}

function buildCombatView(
  publicState: PublicState,
  ownSlot: PlayerSlot,
  ownHand: PlayerHandRow,
  attackerSlot: PlayerSlot | undefined,
): CombatState | null {
  if (!publicState.combat) {
    return null
  }

  const isOwnAttacker = attackerSlot === ownSlot
  const revealedAttackerCardIds = new Set(publicState.combat.attackerCardsRevealed.map((card) => card.id))
  const usedDefenderCardIds = new Set([
    ...publicState.combat.resolvedDuels.map((entry) => entry.duel.defenderCard.id),
    ...publicState.combat.pendingTies.map((duel) => duel.defenderCard.id),
  ])
  const remainingAttackerCount = publicState.combat.attackerSlotsTotal - publicState.combat.attackerCardsRevealed.length
  const consumedDefenderCount = publicState.combat.resolvedDuels.length + publicState.combat.pendingTies.length
  const remainingDefenderCount = publicState.combat.attackerSlotsTotal - consumedDefenderCount

  // Only the attacker knows the real identity of its own not-yet-revealed
  // cards; the defender only ever needs isCombatFinished's *length* check,
  // so it gets count-only placeholders. Symmetrically, only the defender
  // knows the real identity of its remaining defenderPool picks; the
  // attacker only ever needs the count, never the identities (it can't
  // pick from the defender's pool).
  return {
    attackerQueue: isOwnAttacker
      ? (ownHand.pending_attack_queue ?? []).filter((card) => !revealedAttackerCardIds.has(card.id))
      : placeholderCards(remainingAttackerCount, `${ownSlot}-attacker-queue`),
    revealedCard: publicState.combat.revealedCard,
    defenderPool: isOwnAttacker
      ? placeholderCards(remainingDefenderCount, `${ownSlot}-defender-pool`)
      : (ownHand.pending_defender_pool ?? []).filter((card) => !usedDefenderCardIds.has(card.id)),
    pendingTies: publicState.combat.pendingTies,
    resolvedDuels: publicState.combat.resolvedDuels,
  }
}

/**
 * Combines the room's public state with the calling client's own private
 * hand into a GameState shape consumable by the unmodified lib/game/*
 * functions and by GameBoard. `ownSlot` is always mapped to `state.player`
 * ("this browser") and the other slot to `state.npc` ("the opponent") —
 * see the naming note in roomSync.test.ts for why lib/game/*'s
 * player/npc vocabulary is reused structurally rather than forked.
 */
export function buildGameStateView(
  publicState: PublicState,
  ownSlot: PlayerSlot,
  ownHand: PlayerHandRow,
  attackerSlot: PlayerSlot | undefined = undefined,
  roomWinner: PlayerSlot | null = null,
): GameState {
  const opponentSlot = OTHER_SLOT[ownSlot]
  const attackerSide: Side = attackerSlot === ownSlot ? 'player' : 'npc'
  const mappedPhase = publicState.phase === 'round-summary' ? 'combat' : publicState.phase
  const winner: Side | null = roomWinner === null ? null : roomWinner === ownSlot ? 'player' : 'npc'

  return {
    player: buildOwnArmy(ownHand),
    npc: buildOpponentArmy(publicState, opponentSlot),
    // PvP has no difficulty/redo concept; these two fields exist only
    // because GameState requires them structurally (redo is Easy-only
    // single-player, never true in PvP per the spec's "PvP Ace Guarantee").
    difficulty: 'normal',
    roundRedoAvailable: false,
    roundStartSnapshot: null,
    attackerSide,
    phase: mappedPhase,
    combat: buildCombatView(publicState, ownSlot, ownHand, attackerSlot),
    winner,
  }
}
```

The hook (Chunk 3) must pass `rooms.winner` (mapped from `'a' | 'b' | null`
to `PlayerSlot | null`) as this fifth argument whenever it calls
`buildGameStateView`, so `GameState.winner` reflects the real outcome
instead of always being `null`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/multiplayer/roomSync.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the failing tests for the optimistic-write helper**

Add to `lib/multiplayer/roomSync.test.ts`:

```ts
import { writeWithVersionGuard } from './roomSync'

describe('writeWithVersionGuard', () => {
  it('succeeds when the update affects exactly one row', async () => {
    const update = jest.fn(async () => ({ affectedRows: 1 }))

    const result = await writeWithVersionGuard(update, 3)

    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith(3)
  })

  it('reports a version conflict when zero rows are affected', async () => {
    const update = jest.fn(async () => ({ affectedRows: 0 }))

    const result = await writeWithVersionGuard(update, 3)

    expect(result).toEqual({ ok: false, reason: 'version-conflict' })
  })

  it('propagates thrown errors as a network-error result', async () => {
    const update = jest.fn(async () => {
      throw new Error('boom')
    })

    const result = await writeWithVersionGuard(update, 3)

    expect(result).toEqual({ ok: false, reason: 'network-error', message: 'boom' })
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx jest lib/multiplayer/roomSync.test.ts`
Expected: FAIL — `writeWithVersionGuard` is not exported.

- [ ] **Step 7: Implement `writeWithVersionGuard`**

Add to `roomSync.ts`:

```ts
export type VersionGuardResult =
  | { ok: true }
  | { ok: false; reason: 'version-conflict' }
  | { ok: false; reason: 'network-error'; message: string }

/**
 * Generic wrapper for the `WHERE version = expected` optimistic-concurrency
 * pattern described in the spec's Architecture Overview: `update` is
 * expected to perform a Supabase `.update(...).eq('version', expectedVersion)`
 * and resolve with how many rows it actually affected (0 means someone
 * else wrote first). Callers (the hook in Chunk 3) decide how to react to
 * a conflict (refetch + reconcile, or discard as a harmless no-op).
 */
export async function writeWithVersionGuard(
  update: (expectedVersion: number) => Promise<{ affectedRows: number }>,
  expectedVersion: number,
): Promise<VersionGuardResult> {
  try {
    const result = await update(expectedVersion)
    return result.affectedRows > 0 ? { ok: true } : { ok: false, reason: 'version-conflict' }
  } catch (error) {
    return { ok: false, reason: 'network-error', message: error instanceof Error ? error.message : 'unknown error' }
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest lib/multiplayer/roomSync.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 9: Commit**

```bash
git add lib/multiplayer/roomSync.ts lib/multiplayer/roomSync.test.ts
git commit -m "Add multiplayer public/private state merge logic and optimistic-write helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 3: `hooks/useMultiplayerGameState.ts` — the realtime-backed hook

This chunk wires `roomSync.ts` + Supabase Realtime + the `lib/game/*`
functions into a hook with a public shape close to `useGameState`'s, so
`GameBoard` can be reused for both modes with minimal prop-mapping
differences (handled in Chunk 5). Because this hook is inherently
network-dependent, its Jest coverage is necessarily lighter than Chunk 2's
pure logic — cover what's mockable, and rely on the Chunk 5 manual
two-browser test for true end-to-end coverage, exactly as the spec's
Testing Strategy section anticipates.

**Files:**
- Create: `hooks/useMultiplayerGameState.ts`
- Test: `hooks/useMultiplayerGameState.test.ts`

- [ ] **Step 1: Write the failing test for the room-code/localStorage restore logic**

The one pure, easily-testable piece of this hook (besides what Chunk 2
already covers) is figuring out, from `localStorage`, which room code (if
any) this browser should try to reconnect to on load. Create
`hooks/useMultiplayerGameState.test.ts`:

```ts
import { loadStoredRoomCode, ROOM_CODE_STORAGE_KEY } from './useMultiplayerGameState'

describe('loadStoredRoomCode', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredRoomCode(null)).toBeNull()
  })

  it('returns the stored code when it looks like a valid 5-digit code', () => {
    expect(loadStoredRoomCode('04213')).toBe('04213')
  })

  it('rejects malformed stored values', () => {
    expect(loadStoredRoomCode('not-a-code')).toBeNull()
    expect(loadStoredRoomCode('123')).toBeNull()
  })
})

describe('ROOM_CODE_STORAGE_KEY', () => {
  it('is a stable, namespaced key', () => {
    expect(ROOM_CODE_STORAGE_KEY).toBe('battle-card-game-multiplayer-room-code')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest hooks/useMultiplayerGameState.test.ts`
Expected: FAIL — `Cannot find module './useMultiplayerGameState'`.

- [ ] **Step 3: Implement the hook**

This is the largest single file in this plan; implement it in the
structure below, following the Sync Protocol steps from the design spec
1:1 (each numbered comment corresponds to that step):

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient, ensureAnonymousSession } from '@/lib/multiplayer/supabaseClient'
import { buildGameStateView, writeWithVersionGuard } from '@/lib/multiplayer/roomSync'
import type { PlayerHandRow, PlayerSlot, PublicState, RoomRow } from '@/lib/multiplayer/types'
import {
  assignDefenderCard,
  finalizeCombat,
  isCombatFinished,
  revealNextAttacker as revealNextCombatAttacker,
} from '@/lib/game/combat'
import { ageRestingCards, addWinnersToRest } from '@/lib/game/rest'
import type { GameState } from '@/lib/game/types'

export const ROOM_CODE_STORAGE_KEY = 'battle-card-game-multiplayer-room-code'

export function loadStoredRoomCode(rawValue: string | null): string | null {
  return rawValue && /^\d{5}$/.test(rawValue) ? rawValue : null
}

// ... (hook body: see step-by-step breakdown below)
```

Implement the hook's internals as the following pieces, each directly
implementing one Sync Protocol step from the spec:

1. **Session + room bootstrap.** On mount, call `ensureAnonymousSession()`,
   read `loadStoredRoomCode(localStorage.getItem(ROOM_CODE_STORAGE_KEY))`.
   If a code is stored, call a shared internal `connectToRoom(code)`
   helper (see below) to fetch the room, determine `ownSlot`, fetch this
   client's own `player_hands` row, and start the Realtime subscription.
   `connectToRoom` is the single place that does all of this so
   `createRoom`/`joinRoom` (steps 2-3 below) can reuse it instead of only
   handling it at mount time.
2. **`createRoom(nickname)`** — uses `createRoomWithRetry` from
   `lib/multiplayer/roomCode.ts` (already built in the backend plan) to
   insert a `rooms` row with `status: 'waiting'`, `player_a_uid: auth.uid()`,
   `player_a_nickname: nickname`. On success, persists the code to
   `localStorage`, sets `ownSlot = 'a'`, then immediately calls
   `connectToRoom(code)` so the row/hand are fetched and the Realtime
   channel is subscribed right away — a room created but never subscribed
   to would never observe Player B joining.
3. **`joinRoom(code, nickname)`** — calls the `join_room` RPC (see backend
   plan Chunk 1); on success, persists the code, sets `ownSlot = 'b'`,
   then immediately calls `connectToRoom(code)` for the same reason as
   `createRoom` — this client must be subscribed *before* it can observe
   its own `status: 'dealing'` transition and react to it. Once
   subscribed and `status` observed via Realtime becomes `'dealing'` and
   this client is the one whose `join_room` call just succeeded (i.e.
   it's player B), calls the `deal_room` RPC per Room Lifecycle step 4 of
   the spec — with the same "stuck in dealing" timeout-triggered retry
   described there (any client may call `deal_room` again after ~5s if
   still `'dealing'`).
   - `connectToRoom(code)` itself: fetches the `rooms` row by `code`,
     compares `auth.uid()` against `player_a_uid`/`player_b_uid` to
     determine `ownSlot: PlayerSlot` (skipped if `ownSlot` was already
     just set by `createRoom`/`joinRoom`), fetches this client's own
     `player_hands` row, and subscribes to Postgres Changes on `rooms`
     filtered by `id=eq.<room id>` via
     `supabase.channel(...).on('postgres_changes', ...)`.
4. **Realtime handler** — every incoming `rooms` row update replaces local
   `publicState`/`version`/`status`/`winner`, then re-fetches this
   client's own `player_hands` row **only when needed** (i.e., when
   `roundNumber` increased or `phase` changed in a way that implies this
   client's own hand changed — for simplicity, always refetch `player_hands`
   after any `rooms` update; it's a cheap RLS-scoped single-row read and
   correctness matters far more than shaving one query).
5. **Action functions**, one per Sync Protocol step, each following the
   single-writer-per-step rule (the hook simply never calls a write
   function that isn't its own side's responsibility, matching the rule
   from the spec's Architecture Overview), and each following a
   **private-write-first, then-public-write, with idempotent recovery**
   pattern to stay reconnect-safe: before drawing/selecting anything new,
   each action first checks whether its own `player_hands` row already
   has a pending value for the *current* `roundNumber` (e.g.
   `pending_attack_queue` already set) — if so, it skips straight to
   publishing that existing value instead of drawing/selecting again,
   making every action safe to re-run after a reload or a failed second
   write:
   - `confirmDefenderSelection(cardIds)` — only when acting as defender:
     if its own `pending_defender_pool` for this round is already set,
     re-publish it as-is (recovery path); otherwise moves the chosen
     cards out of the local `available` into `pending_defender_pool`
     (private `player_hands` write, tagged with the current
     `roundNumber`), then — only once that private write has confirmed
     success — writes, in one public update, `combat.defenderCommitted =
     true` **and** `phase: 'combat'` (step 2). This is the one write that
     actually transitions the room out of `'selecting'`; it must only run
     once the attacker's `combat.attackerSlotsTotal` (below) already
     exists publicly, since the defender's write only sets
     `defenderCommitted`/`phase`, not `attackerSlotsTotal` itself. When
     acting as attacker (random draw), a companion internal function
     checks for an existing `pending_attack_queue` first, else draws
     random cards from `available` into `pending_attack_queue` (private
     write), then publishes the **full initial `PublicCombatState`**
     (`attackerSlotsTotal`, `attackerCardsRevealed: []`, `revealedCard:
     null`, `defenderCommitted: false`, `pendingTies: []`,
     `resolvedDuels: []`) while `phase` stays `'selecting'` (step 1) —
     triggered automatically once both `slotCount` is known and it's this
     client's turn to draw, mirroring the auto-advance pattern already
     used in `useGameState.ts`. `revealNextAttacker`/`selectDefenderCard`
     below are only meaningful once `phase === 'combat'`.
   - `revealNextAttacker()` — attacker-only: pops the next card from its
     own `pending_attack_queue`, appends it to `public_state.combat.attackerCardsRevealed`,
     sets it as `revealedCard` (step 3). This step only ever touches
     public state (the private `pending_attack_queue` itself is never
     mutated mid-combat — `buildGameStateView` already derives "what's
     left" by diffing against `attackerCardsRevealed`, per Chunk 2), so
     there is no private/public ordering concern here.
   - `selectDefenderCard(cardId)` — defender-only: runs
     `assignDefenderCard` locally against its own reconstructed
     `CombatState`, then writes the resulting resolved-duel/pending-tie
     entry into `public_state.combat` (step 4). Also public-only, for the
     same reason as `revealNextAttacker`.
   - **Tie finalization + round-summary transition** — assigned to the
     defender only (single writer). This runs from the **reconciliation
     effect** (not just once, immediately after `selectDefenderCard`) so
     it is retry-safe across reloads: on every public-state change, if
     `phase === 'combat'` and `isCombatFinished(combat)` is true and
     `combat.pendingTies.length > 0`, the defender writes
     `finalizeCombat(combat)`'s result via `writeWithVersionGuard` (safe
     to re-run — `finalizeCombat` is a no-op once `pendingTies` is
     already empty, so replaying this check after a reload or a failed
     write simply retries the same idempotent write). Once
     `isCombatFinished` is true **and** `pendingTies` is empty, the
     defender performs one further public write (also from the
     reconciliation effect, also idempotent — skipped if `phase` is
     already `'round-summary'`) setting `phase: 'round-summary'`. Only
     this explicit write actually advances the phase; nothing else does,
     which is what makes `roundSummaryDismissedBy` reachable at all.
   - `dismissRoundResult()` — sets this client's own
     `roundSummaryDismissedBy` flag (never the other's).
   - An internal reconciliation effect (runs on every public-state change,
     covering both the live path and the reconnect/self-heal path,
     matching Sync Protocol steps 0 and 6), split into two independently
     retriable stages so neither can deadlock if the other's write fails
     or the client reloads mid-sequence:
     - **Stage A — apply own round end privately.** If
       `roundSummaryDismissedBy` is `{a: true, b: true}` (or, for the
       skip-combat path below, unconditionally) and this client's own
       `last_applied_round < roundNumber`, apply `processRoundEnd`-
       equivalent logic (`ageRestingCards`/`addWinnersToRest` from
       `lib/game/rest.ts` against `public_state.combat.resolvedDuels`
       plus this client's own pending fields) to its own `player_hands`
       row, clear its own `pending_*` fields, and set its own private
       `last_applied_round = roundNumber` in that same write.
     - **Stage B — publish own completion flag and public summary
       together.** Independently of whether Stage A just ran or ran in a
       prior pass: whenever this client's own `last_applied_round ===
       roundNumber` **and** its own public `roundEndAppliedBy` flag is
       still `false`, write, in the *same* public write: its own
       `roundEndAppliedBy` flag set to `true`, **and** its own recomputed
       `availableCount`/`resting` (read from its own already-updated
       `player_hands` row, which it *does* have access to — unlike the
       other side's hand) into `publicState.playerA`/`playerB` (whichever
       is its own slot). This is what makes the public state
       self-sufficient for the shared conclusion below: neither side ever
       needs to read the *other* side's private `player_hands` row, only
       its own — each side publishes its own summary as part of
       confirming its own completion. Checking this every reconciliation
       pass (rather than only right after Stage A) is what makes it safe
       for Stage A and Stage B to land in separate renders/reloads — a
       client that completed Stage A but crashed before Stage B simply
       republishes its flag+summary on the next mount once
       `last_applied_round` is already correct.
     - **Shared conclusion.** Once both `roundEndAppliedBy` flags **and**
       both sides' public `availableCount`/`resting` are up to date (i.e.
       both published via Stage B above), **either** client may submit
       the shared conclusion write — this is deliberately *not*
       attacker-only (unlike the other steps): by this point every value
       the write needs is already public, so the write is a pure,
       deterministic function of already-published state and it does not
       matter which browser happens to submit it first (the loser of the
       race simply gets a harmless `version-conflict` from
       `writeWithVersionGuard` and does nothing further). Restricting
       this specific write to one side would otherwise let a disconnected
       attacker permanently strand the room in round-summary. The payload:
       increment `roundNumber`; swap `attacker_side`; reset
       `roundSummaryDismissedBy`/`roundEndAppliedBy` to `{a: false, b:
       false}`; clear `combat` to `null`; set `phase` to `'game-over'` and
       `rooms.winner`/`rooms.status = 'finished'` if either side's
       resulting `availableCount + resting.length === 0` (winner is
       whichever slot still has cards remaining), otherwise `'selecting'`.
       (`playerA`/`playerB` summaries themselves were already updated by
       Stage B and are left as-is by this write.)
   - Same reconciliation effect also implements the `slotCount === 0`
     skip-combat path (step 0), reusing the identical Stage A / Stage B /
     shared-conclusion structure above (Stage A runs unconditionally
     rather than gated on dismissal, since there is no round-summary step
     to dismiss when combat was skipped): if `attackerAvailableCount` or
     `defenderAvailableCount` (derived from public counts) is 0, Stage A
     applies `ageRestingCards` to this client's own hand directly (no
     combat, no round-summary phase) guarded by the same
     `last_applied_round` check; Stage B (own flag + own public summary)
     and the shared conclusion (either side, same payload including
     `winner`/`status`) are unchanged from the combat path.
   - All public writes go through `writeWithVersionGuard`; on
     `'version-conflict'`, simply refetch the room (the next Realtime
     event or an immediate manual refetch) and let the reconciliation
     effect above decide the correct next action — never blindly retry
     the exact same write, since the state it was based on is now stale.
6. **Connection status** — track two distinct things, matching the
   spec's Presence requirement: (a) this browser's own connection to
   Supabase, via the channel's own subscribe-status callback, used only
   to drive a local "reconnecting…" indicator; and (b) whether the
   *opponent* is actually present, via Supabase Realtime **Presence**
   (`channel.track({ slot: ownSlot })` on subscribe, then
   `channel.on('presence', { event: 'sync' }, ...)` plus `'join'`/`'leave'`
   handlers to check whether the other slot's key is currently present).
   Only (b) should drive `isPeerConnected: boolean` for Chunk 4's UI
   banner — a healthy connection to Supabase with an absent opponent must
   still show "peer disconnected", which a channel-status-only check
   cannot distinguish. This remains informational only per the spec (no
   blocking/timeout behavior).

Export the hook with a shape mirroring `useGameState`'s:

```ts
export function useMultiplayerGameState(): {
  state: GameState | null           // null until a room is joined/dealt
  roomStatus: RoomRow['status'] | null
  roomCode: string | null
  publicPhase: PublicState['phase'] | null   // exposes 'round-summary' distinctly, unlike state.phase
  isPeerConnected: boolean
  ownNickname: string | null
  opponentNickname: string | null
  actions: {
    createRoom: (nickname: string) => Promise<{ ok: true; code: string } | { ok: false; reason: string }>
    joinRoom: (code: string, nickname: string) => Promise<{ ok: true } | { ok: false; reason: string }>
    confirmDefenderSelection: (cardIds: string[]) => void
    revealNextAttacker: () => void
    selectDefenderCard: (cardId: string) => void
    dismissRoundResult: () => void
    leaveRoom: () => void
  }
} {
  // ... wires together the pieces described above using useState/useEffect/useRef,
  // following the same patterns already established in hooks/useGameState.ts
  // (replaceState/updateState helpers, a timeoutRef for any debounced/delayed
  // auto-actions, isReady gating before rendering real state).
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest hooks/useMultiplayerGameState.test.ts`
Expected: PASS (4 tests — the pure `loadStoredRoomCode`/`ROOM_CODE_STORAGE_KEY`
tests only; the rest of the hook is covered by the Chunk 5 manual test).

- [ ] **Step 5: Commit**

```bash
git add hooks/useMultiplayerGameState.ts hooks/useMultiplayerGameState.test.ts
git commit -m "Add useMultiplayerGameState hook implementing the Sync Protocol

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 4: Lobby UI — main menu, create/join screens, connection banner

**Files:**
- Create: `components/multiplayer/MainMenu.tsx`
- Create: `components/multiplayer/CreateRoomScreen.tsx`
- Create: `components/multiplayer/JoinRoomScreen.tsx`
- Create: `components/multiplayer/ConnectionStatusBanner.tsx`
- Modify: `lib/i18n/translations.ts` (add a `multiplayer` section, both `en`
  and `cs` translation objects)

- [ ] **Step 1: Add i18n keys**

Follow the existing pattern in `lib/i18n/translations.ts` (see the `app`/
`roles`/`armies` sections already there) and add a new top-level
`multiplayer` section to the `Translations` interface plus both language
objects, covering at minimum: main menu button labels ("Hrát proti
počítači" / "Hrát s kamarádem online" / "Play vs computer" / "Play online
with a friend"), create/join sub-choice labels, nickname input placeholder,
room code display/copy button, "čekání na soupeře…" waiting state, join
error messages (room not found / full / already started), and the peer
disconnected banner text.

- [ ] **Step 2: Build `MainMenu.tsx`**

A simple two-button screen (styled consistently with the existing
`DifficultyPicker` in `app/page.tsx` — reuse the same Tailwind
class patterns for visual consistency): "Play vs computer" (calls a
`onSelectSinglePlayer` prop) and "Play online with a friend" (calls
`onSelectMultiplayer`, which Chunk 5 will use to show a create/join
sub-choice).

- [ ] **Step 3: Build `CreateRoomScreen.tsx`**

Nickname text input + "Založit" button calling
`actions.createRoom(nickname)` from `useMultiplayerGameState`. On success,
displays the room code large with a copy-to-clipboard button
(`navigator.clipboard.writeText`) and a "čekání na soupeře…" message while
`roomStatus === 'waiting'`.

- [ ] **Step 4: Build `JoinRoomScreen.tsx`**

Nickname + 5-digit code text inputs + "Připojit" button calling
`actions.joinRoom(code, nickname)`. Renders the `reason` string from a
failed result as an inline error message.

- [ ] **Step 5: Build `ConnectionStatusBanner.tsx`**

```tsx
'use client'

interface ConnectionStatusBannerProps {
  isPeerConnected: boolean
  message: string
}

export function ConnectionStatusBanner({ isPeerConnected, message }: ConnectionStatusBannerProps) {
  if (isPeerConnected) {
    return null
  }

  return (
    <div className="rounded-full border border-military-gold/40 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-military-gold">
      {message}
    </div>
  )
}
```

- [ ] **Step 6: Add React Testing Library + jsdom test environment**

The project's current `jest.config.js` uses `testEnvironment: 'node'` and
has no React Testing Library installed (verified: `package.json` has
neither `@testing-library/react` nor `jest-environment-jsdom`). Component
smoke tests need a DOM, so:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom jest-environment-jsdom
```

Add a project-relative override so only `components/multiplayer/**`
tests use jsdom (leave the rest of the suite on the faster `node`
environment):

```js
// jest.config.js — add a testEnvironment override via a docblock instead
// of a global config change, OR add a `projects` array. Simplest: add a
// per-file docblock at the top of each new test file:
// /**
//  * @jest-environment jsdom
//  */
```

Create `jest.setup.ts` (imported via `setupFilesAfterEach` /
`setupFilesAfterEnv` in `jest.config.js`) containing
`import '@testing-library/jest-dom'`, and add
`setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']` to `jest.config.js`.

- [ ] **Step 7: Write component smoke tests**

Create a Jest + React Testing Library smoke test for each new component
(each test file starting with the `@jest-environment jsdom` docblock from
Step 6) confirming: `MainMenu` calls the right callback per button;
`CreateRoomScreen` shows the code and "waiting" text once `roomStatus` is
`'waiting'`; `JoinRoomScreen` shows an error message when
`actions.joinRoom` resolves with `{ ok: false, reason }`;
`ConnectionStatusBanner` renders nothing when `isPeerConnected` is true and
renders `message` when false.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest components/multiplayer`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/multiplayer/ lib/i18n/translations.ts jest.config.js jest.setup.ts package.json package-lock.json
git commit -m "Add multiplayer lobby UI: main menu, create/join room, connection banner

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 5: Wiring into `app/page.tsx` + manual end-to-end verification

**Files:**
- Modify: `app/page.tsx`
- Modify: `hooks/useGameState.ts` (extract `buildRoundResultCards`)
- Create: `lib/game/roundResult.ts` (extracted shared helper + test)

- [ ] **Step 1: Extract `buildRoundResultCards` into a shared helper**

`hooks/useGameState.ts` currently has a private `buildRoundResultCards`
function computing captured/lost cards from `state.attackerSide` +
`state.combat.resolvedDuels`. Move it, unchanged, into a new
`lib/game/roundResult.ts` (exported), add a small Jest test file
`lib/game/roundResult.test.ts` covering the attacker-wins/defender-wins
cases (can copy fixtures from `lib/game/state.test.ts`'s existing
`processRoundEnd` tests), then update `useGameState.ts` to import it from
there instead of defining it locally. Run `npx jest lib/game` afterward to
confirm this pure refactor didn't change single-player behavior (all
existing `lib/game/*` and `hooks/useGameState.test.ts` tests must still
pass unmodified).

- [ ] **Step 2: Add a top-level mode state machine**

Introduce a small piece of state in `HomePage` — `'menu' | 'single-player'
| 'multiplayer-create' | 'multiplayer-join' | 'multiplayer-game'` — that
starts at `'menu'` instead of the current auto-start-single-player
behavior. Render `MainMenu` when `'menu'`; the existing single-player JSX
(unchanged) when `'single-player'`; `CreateRoomScreen`/`JoinRoomScreen`
when in those states; and a multiplayer `GameBoard` (fed via
`useMultiplayerGameState()` instead of `useGameState()`, using
`buildGameStateView`'s output as `state`) when `'multiplayer-game'`
(reached once `roomStatus === 'playing'`).

- [ ] **Step 3: Map `useMultiplayerGameState` output onto `GameBoard` props**

This is the single trickiest step in this plan because `GameBoard`'s props
(`isDefenderHuman`, `canRevealNext`, `roundResult`) assume single-player's
invariant that the human is *always* the defender — which is false in
PvP, where either side can be the attacker. Do **not** copy the
single-player prop-mapping block verbatim; instead:

- `playerRole` → `state.attackerSide === 'player' ? 'attacker' : 'defender'`
  (same formula as single-player; `state` here is already the per-browser
  `buildGameStateView` output, so `'player'` correctly means "this
  browser's own side").
- `canRevealNext` → **must require this browser's own side to be the
  attacker**, unlike single-player (which only ever lets the defender
  reveal, since the NPC-as-attacker auto-reveals on a timer). Multiplayer
  formula: `state.attackerSide === 'player' && state.phase === 'combat' &&
  !roundResult && !combat?.revealedCard && Boolean(combat?.attackerQueue.length)`.
  When this browser is the defender, `canRevealNext` must be `false` and
  `onRevealNext` should not be wired to anything meaningful (the opposing
  browser's `revealNextAttacker()` call publishes the reveal; this
  browser only ever observes it via Realtime).
- `selectionAvailableCards`/`onConfirmSelection` → only meaningful when
  this browser's own side is the defender (`state.attackerSide !==
  'player'`); when this browser is the attacker, `selectionRequiredCount`
  should still be computed (via `computeSlotCount(state)`) for display
  purposes, but the panel that lets a human pick specific defender cards
  must not render — mirror `showSelectionPanel`'s existing
  `isDefenderHuman` check in `GameBoard.tsx`, replaced with
  `state.attackerSide !== 'player'` for the multiplayer case, so the
  attacker-side browser sees the "your random cards were drawn" narrative
  panel instead (reuse the existing "not defender" branch already in
  `GameBoard.tsx`'s `showSelectionPanel` ternary — no `GameBoard` changes
  needed, just pass `isDefenderHuman={state.attackerSide !== 'player'}` for
  this specific purpose while still passing the literal `true` above
  needs reconciling — see note below).

  **Resolving the `isDefenderHuman` double-duty conflict:** `GameBoard`
  currently uses the single `isDefenderHuman` prop for two different
  things: (a) gating the human defender-selection panel and (b) an
  overview-copy toggle. Since multiplayer needs "is *this browser*
  currently the defender" for both of those (not "is the defender always
  human", which is trivially true in PvP), the correct single mapping is:
  `isDefenderHuman={state.attackerSide !== 'player'}` — i.e. reuse the
  existing prop for its literal meaning ("should this browser get the
  human defender-selection UI") rather than treating it as a
  humanness flag. This is consistent with `GameBoard`'s actual usage
  (`showSelectionPanel`, the overview-copy ternary, and
  `isRoundResultVisible`'s `BattleSlots` wiring) — no `GameBoard.tsx`
  changes are required.
- `roundResult` → derive when `publicPhase === 'round-summary'`
  (**not** `state.phase`, which `buildGameStateView` already maps to
  `'combat'` for round-summary — this is exactly why the hook exposes
  `publicPhase` separately, per Chunk 3's type comment). Reuse
  `buildRoundResultCards` from `lib/game/roundResult.ts` (extracted in
  Step 1 above) against the local browser's already player/npc-mapped
  `state.attackerSide` + `state.combat.resolvedDuels` — no duplicate
  winner/loser branching logic needed:
  - `capturedCards`/`lostCards`: from `buildRoundResultCards(state)`.
  - `canRedoRound`: always `false` (PvP never offers redo).
  - `endsGame`: intentionally always `false` for this modal. Unlike
    single-player (which can synchronously compute `nextState.phase`
    before showing the modal), the authoritative game-over determination
    in multiplayer only happens once *both* sides' Stage A/B writes and
    the shared conclusion write have completed — which is after this
    modal is shown and dismissed, not before. Showing a possibly-wrong
    "campaign ending" hint here isn't worth the complexity of predicting
    it from partial public state; the real game-over screen already
    renders correctly and authoritatively once `roomStatus`/`state.phase`
    actually reaches `'game-over'`, via the same top-level game-over
    banner block already in `app/page.tsx`.
- `onDismissRoundResult` → `actions.dismissRoundResult` (as already
  planned). This is what makes the modal's "Continue" button actually
  call into Stage A of the reconciliation logic in Chunk 3.
- Add `ownNickname`/`opponentNickname` in place of the hardcoded
  "Player"/"NPC" name props, and render `<ConnectionStatusBanner
  isPeerConnected={isPeerConnected} message={...} />` above the board.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all existing single-player tests still pass unchanged (the
Step 1 refactor is behavior-preserving — same function, new home), plus
all new multiplayer tests from Chunks 1–4 and the new
`lib/game/roundResult.test.ts`.

- [ ] **Step 5: Run build + lint**

Run: `npm run build`
Run: `npm run lint`
Expected: both clean.

- [ ] **Step 6: Manual two-browser end-to-end test (with the user)**

Per the spec's Testing Strategy section: open two browser windows (or a
second device), create a room in one, join with the code in the other,
play a full game to completion, including deliberately closing/reopening
one browser mid-round to confirm the reconnect/self-heal behavior from
Sync Protocol steps 0 and 6 works as designed. Fix any issues found before
considering this plan complete.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx hooks/useGameState.ts lib/game/roundResult.ts lib/game/roundResult.test.ts
git commit -m "Wire multiplayer mode into the main menu and game page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification for this plan

- [ ] `npm test`, `npm run build`, `npm run lint` all clean.
- [ ] Manual two-browser playtest completed and confirmed working by the
  user, including a mid-round disconnect/reconnect.
- [ ] Confirm with the user before doing a `git push` — per this repo's
  standing rule, push only happens on an explicit fresh request each time,
  never automatically as part of finishing a plan.
