import { buildAttackerQueue } from './combat'
import type { Card } from './types'

/**
 * Selects random attacker cards for the NPC using the same hidden draw rule as any attacker.
 */
export function npcSelectAttack(
  available: Card[],
  count: number,
  rng: () => number = Math.random,
): Card[] {
  return buildAttackerQueue(available, count, rng)
}

/**
 * Chooses the weakest defender card that still wins, or sacrifices the weakest card if none can win.
 */
export function npcSelectDefense(defenderPool: Card[], revealedCard: Card): Card {
  if (defenderPool.length === 0) {
    throw new Error('NPC cannot defend with an empty defender pool.')
  }

  const sortedByPower = [...defenderPool].sort((left, right) => left.power - right.power)

  return sortedByPower.find((card) => card.power > revealedCard.power) ?? sortedByPower[0]
}
