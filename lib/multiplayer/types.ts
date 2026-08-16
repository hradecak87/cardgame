import type { Card, CombatState as SinglePlayerCombatState, Duel, ResolvedDuel } from '@/lib/game/types'

export type RoomStatus = 'waiting' | 'dealing' | 'playing' | 'finished' | 'abandoned'
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
  // Real identities of the defender's chosen pool, broadcast publicly once
  // committed. Per the game's rules only the *attacker's* queue is meant
  // to stay hidden (revealed one at a time as combat proceeds); the
  // defender's chosen cards are legitimately visible to both sides as
  // soon as they're picked, same as in single-player. Empty/undefined
  // before the defender commits.
  defenderPoolCards?: Card[]
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
  abandoned_by?: string | null
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
