import { addWinnersToRest, ageRestingCards } from './rest'
import type { Army, Card } from './types'

function createCard(id: string, power: number): Card {
  return {
    id,
    rank: '7',
    suit: 'hearts',
    power,
  }
}

describe('rest', () => {
  test('ageRestingCards decrements counters and returns cards to available at zero', () => {
    const returningCard = createCard('returning', 3)
    const stayingCard = createCard('staying', 5)
    const army: Army = {
      available: [createCard('available', 1)],
      resting: [
        { card: returningCard, roundsRemaining: 1 },
        { card: stayingCard, roundsRemaining: 2 },
      ],
    }

    const next = ageRestingCards(army)

    expect(next.available.map((card) => card.id)).toEqual(['available', 'returning'])
    expect(next.resting).toEqual([{ card: stayingCard, roundsRemaining: 1 }])
  })

  test('new winners are not aged on the same round they enter rest', () => {
    const previousWinner = createCard('older-resting', 7)
    const newWinner = createCard('fresh-winner', 8)
    const army: Army = {
      available: [newWinner],
      resting: [{ card: previousWinner, roundsRemaining: 1 }],
    }

    const aged = ageRestingCards(army)
    const updated = addWinnersToRest(aged, [newWinner])

    expect(updated.available.map((card) => card.id)).toEqual(['older-resting'])
    expect(updated.resting).toEqual([{ card: newWinner, roundsRemaining: 2 }])
  })
})
