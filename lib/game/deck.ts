import type { Army, Card, Difficulty, Rank, Suit } from './types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']

const POWER_BY_RANK: Record<Rank, number> = {
  '7': 1,
  '8': 2,
  '9': 3,
  '10': 4,
  J: 5,
  Q: 6,
  K: 7,
  A: 8,
}

function shuffleCards<T>(items: readonly T[], rng: () => number): T[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

/**
 * Builds the full 32-card battle deck with stable ids and rank-derived power values.
 */
export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank}-${suit}`,
      rank,
      suit,
      power: POWER_BY_RANK[rank],
    })),
  )
}

/**
 * Shuffles a supplied deck and deals two 16-card starting armies based on the selected difficulty.
 */
export function dealHands(
  deck: Card[],
  difficulty: Difficulty,
  rng: () => number = Math.random,
): { player: Army; npc: Army } {
  const aces = deck.filter((card) => card.rank === 'A')
  const nonAces = deck.filter((card) => card.rank !== 'A')
  const shuffledAces = shuffleCards(aces, rng)
  const shuffledNonAces = shuffleCards(nonAces, rng)
  const playerAceCount =
    difficulty === 'easy' ? 2 : difficulty === 'expert' ? 1 : rng() < 0.5 ? 1 : 2

  const playerCards = shuffleCards(
    [...shuffledAces.slice(0, playerAceCount), ...shuffledNonAces.slice(0, 14)],
    rng,
  )
  const npcCards = shuffleCards(
    [...shuffledAces.slice(playerAceCount), ...shuffledNonAces.slice(14, 28)],
    rng,
  )

  return {
    player: {
      available: playerCards,
      resting: [],
    },
    npc: {
      available: npcCards,
      resting: [],
    },
  }
}
