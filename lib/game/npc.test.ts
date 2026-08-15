import { npcSelectAttack, npcSelectDefense } from './npc'
import type { Card } from './types'

function createCard(id: string, power: number): Card {
  return {
    id,
    rank: '7',
    suit: 'hearts',
    power,
  }
}

describe('npc', () => {
  test('npcSelectAttack chooses the requested number of cards from the available pool', () => {
    const available = [
      createCard('a', 1),
      createCard('b', 2),
      createCard('c', 3),
      createCard('d', 4),
    ]

    const selected = npcSelectAttack(available, 2, () => 0)

    expect(selected).toHaveLength(2)
    expect(selected.every((card) => available.some((candidate) => candidate.id === card.id))).toBe(true)
    expect(new Set(selected.map((card) => card.id)).size).toBe(2)
  })

  test('npcSelectDefense uses the lowest-power card that still wins', () => {
    const revealedCard = createCard('attacker', 4)
    const defenderPool = [
      createCard('low', 2),
      createCard('just-enough', 5),
      createCard('overkill', 7),
    ]

    const selected = npcSelectDefense(defenderPool, revealedCard)

    expect(selected.id).toBe('just-enough')
  })

  test('npcSelectDefense sacrifices the lowest-power card when nothing can win', () => {
    const revealedCard = createCard('attacker', 8)
    const defenderPool = [createCard('low', 2), createCard('mid', 4), createCard('high', 8)]

    const selected = npcSelectDefense(defenderPool, revealedCard)

    expect(selected.id).toBe('low')
  })
})
