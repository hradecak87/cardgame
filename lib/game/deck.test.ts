import { createDeck, dealHands } from './deck'
import type { Card, Difficulty, Rank } from './types'

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

  test('dealHands always gives each army exactly 2 aces on easy', () => {
    const deck = createDeck()

    for (let seed = 1; seed <= 25; seed += 1) {
      const { player, npc } = dealHands(deck, 'easy', createSeededRng(seed))

      expect(player.available.filter((card) => card.rank === 'A')).toHaveLength(2)
      expect(npc.available.filter((card) => card.rank === 'A')).toHaveLength(2)
    }
  })

  test('dealHands gives the player exactly 1 ace and the npc 3 on expert', () => {
    const deck = createDeck()

    for (let seed = 1; seed <= 25; seed += 1) {
      const { player, npc } = dealHands(deck, 'expert', createSeededRng(seed))

      expect(player.available.filter((card) => card.rank === 'A')).toHaveLength(1)
      expect(npc.available.filter((card) => card.rank === 'A')).toHaveLength(3)
    }
  })

  test('dealHands gives the player either 1 or 2 aces on normal and the npc gets the complement', () => {
    const deck = createDeck()
    const playerAceCounts = new Set<number>()

    for (let seed = 1; seed <= 25; seed += 1) {
      const { player, npc } = dealHands(deck, 'normal', createSeededRng(seed))
      const playerAces = player.available.filter((card) => card.rank === 'A').length
      const npcAces = npc.available.filter((card) => card.rank === 'A').length

      playerAceCounts.add(playerAces)
      expect([1, 2]).toContain(playerAces)
      expect(npcAces).toBe(4 - playerAces)
      expect(player.available).toHaveLength(14 + playerAces)
      expect(npc.available).toHaveLength(14 + npcAces)
    }

    expect(playerAceCounts).toEqual(new Set([1, 2]))
  })

  test.each<Difficulty>(['easy', 'normal', 'expert'])(
    'dealHands preserves all 32 unique cards across multiple %s deals',
    (difficulty) => {
      const deck = createDeck()

      for (let seed = 1; seed <= 25; seed += 1) {
        const { player, npc } = dealHands(deck, difficulty, createSeededRng(seed))
        const combinedIds = [...player.available, ...npc.available].map((card) => card.id)
        const playerAces = player.available.filter((card) => card.rank === 'A').length
        const npcAces = npc.available.filter((card) => card.rank === 'A').length

        expect(player.available).toHaveLength(14 + playerAces)
        expect(player.resting).toEqual([])
        expect(npc.available).toHaveLength(14 + npcAces)
        expect(npc.resting).toEqual([])
        expect(new Set(combinedIds).size).toBe(32)
        expect(combinedIds).toHaveLength(32)
      }
    },
  )
})
