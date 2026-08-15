import { createDeck, dealHands } from './deck'
import type { Card, Rank } from './types'

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

function createSeededRng(seed: number): () => number {
  let current = seed

  return () => {
    current = (current * 1664525 + 1013904223) % 4294967296
    return current / 4294967296
  }
}

describe('deck', () => {
  test('createDeck builds 32 unique cards with the expected power mapping', () => {
    const deck = createDeck()

    expect(deck).toHaveLength(32)
    expect(new Set(deck.map((card) => card.id)).size).toBe(32)

    deck.forEach((card: Card) => {
      expect(card.power).toBe(POWER_BY_RANK[card.rank])
    })
  })

  test('dealHands always gives each army exactly 2 aces across multiple random deals', () => {
    const deck = createDeck()

    for (let seed = 1; seed <= 25; seed += 1) {
      const { player, npc } = dealHands(deck, createSeededRng(seed))

      expect(player.available.filter((card) => card.rank === 'A')).toHaveLength(2)
      expect(npc.available.filter((card) => card.rank === 'A')).toHaveLength(2)
    }
  })

  test('dealHands preserves all 32 unique cards across multiple random deals', () => {
    const deck = createDeck()

    for (let seed = 1; seed <= 25; seed += 1) {
      const { player, npc } = dealHands(deck, createSeededRng(seed))
      const combinedIds = [...player.available, ...npc.available].map((card) => card.id)

      expect(player.available).toHaveLength(16)
      expect(player.resting).toEqual([])
      expect(npc.available).toHaveLength(16)
      expect(npc.resting).toEqual([])
      expect(new Set(combinedIds).size).toBe(32)
      expect(combinedIds).toHaveLength(32)
    }
  })
})
