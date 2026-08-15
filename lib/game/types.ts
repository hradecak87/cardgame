export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  id: string
  rank: Rank
  suit: Suit
  power: number
}

export interface RestingCard {
  card: Card
  roundsRemaining: number
}

export interface Army {
  available: Card[]
  resting: RestingCard[]
}

export type Difficulty = 'easy' | 'normal' | 'expert'

export const DIFFICULTY_CONFIG: Record<Difficulty, { restRounds: number }> = {
  easy: { restRounds: 2 },
  normal: { restRounds: 2 },
  expert: { restRounds: 3 },
}

export type Role = 'attacker' | 'defender'

export type Side = 'player' | 'npc'

export interface Duel {
  attackerCard: Card
  defenderCard: Card
}

export interface ResolvedDuel {
  duel: Duel
  winner: Role
}

export interface RoundStartSnapshot {
  player: Army
  npc: Army
  attackerSide: Side
}

export interface CombatState {
  attackerQueue: Card[]
  revealedCard: Card | null
  defenderPool: Card[]
  pendingTies: Duel[]
  resolvedDuels: ResolvedDuel[]
}

export type GamePhase = 'selecting' | 'combat' | 'round-end' | 'game-over'

export interface GameState {
  player: Army
  npc: Army
  difficulty: Difficulty
  roundRedoAvailable: boolean
  roundStartSnapshot: RoundStartSnapshot | null
  attackerSide: Side
  phase: GamePhase
  combat: CombatState | null
  winner: Side | null
}
