# Battle Card Game — Design Spec (MVP: 1 Player vs NPC)

## 1. Overview

A web-based card battle game inspired by the Russian card game "Durak," played with a
32-card deck (7, 8, 9, 10, J, Q, K, A × 4 suits). Cards represent soldiers; higher rank
beats lower rank. Each side starts with a random half of the deck (16 cards) as their
army. Players/NPC alternate attacker and defender roles each battle round. Captured
soldiers go to a "rest area" and are unavailable for 2 battle rounds before rejoining
the owner's available army. The game ends when one side's army (available + resting)
is empty.

This spec covers the **MVP scope only**: single player vs. NPC, no accounts, no
multiplayer, no difficulty levels. Those are noted as future phases in section 10 but
are explicitly out of scope for this spec/plan.

## 2. Tech Stack

Consistent with the existing `levelup` project (same author, proven on Vercel):

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** for styling
- **Framer Motion** for card animations (flip, move to rest area, etc.)
- **Jest** for unit tests of game logic
- **PWA**: `manifest.json` + service worker registration (installable on mobile,
  runs standalone in a webview)
- No database, no auth, no Prisma/Supabase in MVP. Game state lives in React state,
  persisted to `localStorage` so a page refresh doesn't lose an in-progress game.
  If the stored value is missing, fails to parse, or doesn't match the expected
  `GameState` shape (basic runtime validation), the app discards it and starts a
  fresh game — it never crashes on a corrupted/stale save.

### Module Boundaries

- `lib/game/deck.ts` — build a full 32-card deck, shuffle, and deal two random
  16-card `Army` hands. Pure functions, no state.
- `lib/game/combat.ts` — `resolveNextDuel(combat) => combat` and the selection
  helpers that build the initial `attackerQueue`/`defenderPool` for a round.
  Pure functions; knows nothing about React or storage.
- `lib/game/rest.ts` — advance rest-area countdowns after a round and move
  cards whose `roundsRemaining` reaches 0 back into `available`. Pure.
- `lib/game/npc.ts` — NPC decision functions: `npcSelectAttack(army, count)`
  and `npcSelectDefense(defenderPool, revealedCard)`. Pure functions taking
  state in, returning a choice out — independently unit-testable without any
  UI or game-loop involvement.
- `lib/game/state.ts` — the reducer/orchestrator that ties the above modules
  together into full round transitions (`selecting` → `combat` →
  `round-end` → next round or `game-over`). This is the only module aware of
  the full `GameState` shape and role-swapping logic.
- `hooks/useGameState.ts` — React hook wrapping `lib/game/state.ts`, exposing
  actions to components (e.g. `selectDefenderCard`, `revealNext`) and handling
  `localStorage` read/write + validation/fallback described above.
- `components/game/*` — presentational board, card, and rest-area components.
  They only read from the hook's exposed state/actions; no game rules live
  here.

Each module above is independently testable: `deck`, `combat`, `rest`, and
`npc` take plain data in and return plain data out, with no dependency on
React, storage, or each other's internals.

## 3. Data Model

```ts
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'

interface Card {
  id: string          // unique id, e.g. "A-spades"
  rank: Rank
  suit: Suit
  power: number        // 1-8, derived from rank (7=1 ... A=8)
}

interface RestingCard {
  card: Card
  roundsRemaining: number // 2 -> 1 -> 0 (leaves rest area)
}

interface Army {
  available: Card[]       // soldiers ready to attack/defend
  resting: RestingCard[]  // soldiers cooling down after a battle
}

type Role = 'attacker' | 'defender'

interface Duel {
  attackerCard: Card
  defenderCard: Card
}

interface CombatState {
  attackerQueue: Card[]   // remaining hidden attacker cards; combat.ts reveals
                          // them one at a time by shifting from the front
  revealedCard: Card | null  // the current attacker card awaiting a defender
                             // response (null between duels/at combat start)
  defenderPool: Card[]    // defender's remaining selected cards, freely
                          // assignable in any order (defender's choice)
  pendingTies: Duel[]     // unresolved tied duels, oldest first — all get
                          // resolved together once a decisive duel occurs
                          // (see §5 for the chaining algorithm)
  resolvedDuels: { duel: Duel; winner: 'attacker' | 'defender' }[]
}

interface GameState {
  player: Army
  npc: Army
  attackerSide: 'player' | 'npc'   // who attacks this round
  phase: 'selecting' | 'combat' | 'round-end' | 'game-over'
  combat: CombatState | null       // present only during 'combat' phase
  winner: 'player' | 'npc' | null
}
```

Note: the defender's selected cards are *not* pre-bound to a specific attacker
card ahead of time. Only `defenderPool` (the defender's chosen set) is fixed
during the selection phase; which specific card answers which revealed
attacker card is decided turn-by-turn during combat (see §5).

## 4. Game Flow

1. **Deal**: shuffle 32 cards, split into two random 16-card hands (player, NPC).
   The NPC always attacks first in round 1 (MVP has only player-vs-NPC; the
   "always the non-human side attacks first" rule carries over to future
   multiplayer phases per the original design).
2. **Selection phase**:
   - Slot count is `min(3, attacker.available.length, defender.available.length)`
     — normally 3, but fewer if either side has fewer soldiers available (see §6).
   - Attacker's slots are filled by a **random** draw from the attacker's
     `available` pool. These are hidden (face-down) from both sides until
     revealed in combat.
   - Defender picks the same number of cards **deliberately** from their own
     `available` pool. These are shown face-up on the table immediately (visible
     only conceptually to the defending side — the UI never reveals them to an NPC
     opponent, and for a human vs NPC game there's no hidden-info concern beyond the
     attacker's cards).
3. **Combat phase**: resolve one attacker card at a time (see §5).
4. **Round end** (order matters, to give newly-captured cards the full 2-round
   rest):
   1. First, decrement `roundsRemaining` by 1 for every card **already**
      sitting in either army's `resting` list (i.e. cards resting from a
      *previous* round). Any reaching 0 move back to that army's `available`.
   2. Then, add this round's duel winners (both sides) to their owner's
      `resting` list with `roundsRemaining = 2`. These are *not* decremented
      this round — they start counting down from the next round-end onward,
      guaranteeing they sit out exactly 2 rounds before becoming available.
5. **Role swap**: attacker and defender roles swap for the next round. Go to 2.
6. **Game over check**: `available.length + resting.length` only reflects a
   side's true army size **between rounds** — during the `selecting` and
   `combat` phases, cards temporarily drawn into `attackerQueue`/`defenderPool`
   still count toward that side's army and must not be treated as lost. The
   game-over check therefore only runs immediately after step 4 (round-end),
   once all combat cards have been resolved back into either an
   `available`/`resting` list (winner's side) or transferred away entirely
   (loser's captured cards). If a side's total is 0 at that point, the other
   side wins and `phase` becomes `game-over`.

## 5. Combat Resolution

Split into two functions in `lib/game/combat.ts` so a human defender can see
the revealed card before choosing a response:

- `revealNextAttacker(combat): CombatState` — shifts the next card off
  `attackerQueue` into `revealedCard`. No-op if `revealedCard` is already set
  or the queue is empty.
- `assignDefenderCard(combat, defenderCardId): CombatState` — requires
  `revealedCard` to be set; removes the chosen card from `defenderPool`,
  compares power against `revealedCard`, resolves the duel (or queues it as a
  tie), clears `revealedCard`, and returns the updated state.

Resolution logic on `assignDefenderCard`:

1. Compare `power` of `revealedCard` vs. the chosen `defenderCard`.
2. **Decisive** (powers differ): the higher power wins this duel. This
   duel, **plus every duel currently sitting in `pendingTies`**, is resolved
   with the same winner and appended to `resolvedDuels`; `pendingTies` is
   cleared. For each resolved duel, the losing card is captured (ownership
   transfers to the winner), and both the winner's own card and the newly
   captured card go to the winner's rest area.
3. **Tie** (equal power): push `{ attackerCard: revealedCard, defenderCard }`
   onto `pendingTies` and continue — it stays unresolved until a later duel
   is decisive.
4. Caller calls `revealNextAttacker` again; repeat until `attackerQueue` is
   empty and `revealedCard` is null.
5. If `pendingTies` is non-empty once the queue is exhausted (i.e. the battle
   ends on one or more consecutive ties with nothing left to decide them),
   the **defender wins** all of them — resolve each with `winner: 'defender'`.

This naturally handles multiple chained ties in a row: they all accumulate in
`pendingTies` until either a decisive duel resolves the whole chain at once,
or the battle ends and the defender wins them all.

## 6. Army Size Edge Cases

- Slot count for a round is `min(3, attacker.available.length, defender.available.length)`
  (identical formula to §4) — normally 3, but shrinks to 2 or 1 if either side
  has fewer soldiers currently available (not resting).
- **Zero available on one side**: if either side has `available.length === 0`
  (but the game isn't over — they still have cards resting), slot count is 0
  and no combat can happen this round. Instead, skip straight to the §4
  round-end aging step only (decrement pre-existing `resting` countdowns,
  promote any reaching 0 to `available`) — do **not** swap attacker/defender
  roles for a skipped round. Re-evaluate slot count afterward; repeat this
  skip-and-age step until at least 1 soldier is available on both sides (a
  normal battle round then proceeds) or the game ends per §4 step 6.

## 7. NPC Behavior (MVP)

- **As attacker**: pick N random cards from `available` (matches player rules —
  no special knowledge).
- **As defender**: for each revealed attacker card, choose the **lowest-power
  card from its remaining selected cards that still beats it**. If none of its
  selected cards beat the revealed card, sacrifice its lowest-power selected
  card (minimizing loss).

No difficulty levels in MVP — this single heuristic is the only NPC behavior.

## 8. Visual Design

- **Theme**: Napoleonic era (uniforms, cannons, flags, 19th-century military
  motifs), consistent with the mockup direction approved during brainstorming.
- **Cards**: show classic rank label (7, 8, 9, 10, J, Q, K, A) and suit, plus a
  plain numeric power value (1–8) so the strength is obvious without card
  knowledge.
- **Board layout** ("Layout A" from brainstorming): opponent's face-down cards
  top-center, active battle slots in the middle, player's face-up hand/selection
  at the bottom. Rest area is a horizontal strip of cards near each side's row,
  each showing a small countdown badge ("2 rounds", "1 round"); once a card's
  countdown reaches 0 it leaves the rest strip entirely and returns to the
  player's active hand, so no "Ready" state is ever shown in the rest area.
- **Mobile-first**: Tailwind responsive layout; touch-friendly card selection
  (tap to select/deploy). Must work well in a narrow mobile viewport since it
  will later be wrapped as a mobile app via webview.
- **PWA**: installable manifest + icons, offline-capable shell (no network
  dependency in MVP since there's no backend).

## 9. Testing Strategy

- **Unit tests (Jest)** for the pure game-logic module (`lib/game/`): deck
  shuffle/deal, combat resolution incl. tie-chaining, rest area countdown,
  army-size edge cases, NPC defense heuristic, win condition.
- **Component/UI tests**: light coverage of key interactions (selecting cards,
  triggering combat, seeing rest countdown update) — not exhaustive for MVP.
- No e2e tests required for MVP (project has Playwright available if needed
  later).

## 10. Future Phases (out of scope for this spec)

- Online multiplayer (room code) and same-device 2-player mode, using Supabase
  Realtime + Prisma, reusing the `levelup` patterns.
- User accounts / auth (only needed once multiplayer or persistence across
  devices is required).
- Difficulty levels (NPC advantages, longer rest periods, etc.).

## 11. Out of Scope / Non-Goals for MVP

- No suits-based mechanics (suits are cosmetic only; only `power` matters for
  combat comparisons).
- No trump cards, no drawing additional cards mid-game (all 32 cards are
  allocated at deal time; capturing is the only way an army changes size).
