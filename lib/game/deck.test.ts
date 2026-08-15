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

describe('deck', () => {
  test('createDeck builds 32 unique cards with the expected power mapping', () => {
    const deck = createDeck()

    expect(deck).toHaveLength(32)
    expect(new Set(deck.map((card) => card.id)).size).toBe(32)

    deck.forEach((card: Card) => {
      expect(card.power).toBe(POWER_BY_RANK[card.rank])
    })
  })

  test('dealHands shuffles and splits the deck into two 16-card armies without duplicates', () => {
    const deck = createDeck()
    const { player, npc } = dealHands(deck, () => 0)
    const combinedIds = [...player.available, ...npc.available].map((card) => card.id)

    expect(player.available).toHaveLength(16)
    expect(player.resting).toEqual([])
    expect(npc.available).toHaveLength(16)
    expect(npc.resting).toEqual([])
    expect(new Set(combinedIds).size).toBe(32)
  })
})
