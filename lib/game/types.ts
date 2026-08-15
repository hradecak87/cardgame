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
  attackerSide: Side
  phase: GamePhase
  combat: CombatState | null
  winner: Side | null
}
