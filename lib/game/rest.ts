import type { Army, Card, RestingCard } from './types'

/**
 * Ages all previously resting cards by one round and returns any recovered cards to the available pool.
 */
export function ageRestingCards(army: Army): Army {
  const agedResting = army.resting.map<RestingCard>((entry) => ({
    card: entry.card,
    roundsRemaining: entry.roundsRemaining - 1,
  }))
  const returningCards = agedResting.filter((entry) => entry.roundsRemaining <= 0).map((entry) => entry.card)
  const stillResting = agedResting.filter((entry) => entry.roundsRemaining > 0)

  return {
    available: [...army.available, ...returningCards],
    resting: stillResting,
  }
}

/**
 * Moves won cards into the rest area for the configured number of future round-end ticks.
 */
export function addWinnersToRest(army: Army, wonCards: Card[], restRounds: number): Army {
  const wonIds = new Set(wonCards.map((card) => card.id))

  return {
    available: army.available.filter((card) => !wonIds.has(card.id)),
    resting: [
      ...army.resting,
      ...wonCards.map((card) => ({
        card,
        roundsRemaining: restRounds,
      })),
    ],
  }
}
