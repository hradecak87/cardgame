import type { GameState } from './types'
import type { Card } from './types'

/**
 * Extracts captured and lost cards from a game state's combat resolution.
 * Used by both single-player and multiplayer modes to determine round results.
 */
export function buildRoundResultCards(state: GameState): {
  capturedCards: Card[]
  lostCards: Card[]
} {
  if (!state.combat) {
    return {
      capturedCards: [],
      lostCards: [],
    }
  }

  const capturedCards =
    state.attackerSide === 'player'
      ? state.combat.resolvedDuels
          .filter((entry) => entry.winner === 'attacker')
          .map((entry) => entry.duel.defenderCard)
      : state.combat.resolvedDuels
          .filter((entry) => entry.winner === 'defender')
          .map((entry) => entry.duel.attackerCard)

  const lostCards =
    state.attackerSide === 'player'
      ? state.combat.resolvedDuels
          .filter((entry) => entry.winner === 'defender')
          .map((entry) => entry.duel.attackerCard)
      : state.combat.resolvedDuels
          .filter((entry) => entry.winner === 'attacker')
          .map((entry) => entry.duel.defenderCard)

  return {
    capturedCards,
    lostCards,
  }
}
