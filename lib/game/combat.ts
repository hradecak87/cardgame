import type { Card, CombatState, Duel, ResolvedDuel } from './types'

function shuffleCards<T>(items: readonly T[], rng: () => number): T[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function resolveDuels(duels: Duel[], winner: 'attacker' | 'defender'): ResolvedDuel[] {
  return duels.map((duel) => ({ duel, winner }))
}

/**
 * Randomly draws hidden attacker cards for a round.
 */
export function buildAttackerQueue(
  availableCards: Card[],
  slotCount: number,
  rng: () => number = Math.random,
): Card[] {
  if (slotCount < 0 || slotCount > availableCards.length) {
    throw new Error('slotCount must be between 0 and the number of available attacker cards.')
  }

  return shuffleCards(availableCards, rng).slice(0, slotCount)
}

/**
 * Builds a valid initial combat state from a random attacker draw and explicit defender picks.
 */
export function buildCombatState(
  attackerAvailable: Card[],
  defenderAvailable: Card[],
  defenderCardIds: string[],
  slotCount: number,
  rng: () => number = Math.random,
): CombatState {
  if (defenderCardIds.length !== slotCount) {
    throw new Error('Defender must choose exactly slotCount cards.')
  }

  const defenderPool = defenderCardIds.map((cardId) => {
    const card = defenderAvailable.find((candidate) => candidate.id === cardId)

    if (!card) {
      throw new Error(`Defender card "${cardId}" is not available.`)
    }

    return card
  })

  if (new Set(defenderPool.map((card) => card.id)).size !== defenderPool.length) {
    throw new Error('Defender card selections must be unique.')
  }

  return {
    attackerQueue: buildAttackerQueue(attackerAvailable, slotCount, rng),
    revealedCard: null,
    defenderPool,
    pendingTies: [],
    resolvedDuels: [],
  }
}

/**
 * Reveals the next attacker card, if one is waiting and no card is currently revealed.
 */
export function revealNextAttacker(combat: CombatState): CombatState {
  if (combat.revealedCard || combat.attackerQueue.length === 0) {
    return combat
  }

  const [revealedCard, ...attackerQueue] = combat.attackerQueue

  return {
    ...combat,
    attackerQueue,
    revealedCard,
  }
}

/**
 * Assigns a defender card to the currently revealed attacker card and resolves the resulting duel.
 */
export function assignDefenderCard(combat: CombatState, defenderCardId: string): CombatState {
  if (!combat.revealedCard) {
    throw new Error('Cannot assign a defender card without a revealed attacker card.')
  }

  const defenderCard = combat.defenderPool.find((card) => card.id === defenderCardId)

  if (!defenderCard) {
    throw new Error(`Defender card "${defenderCardId}" is not in the defender pool.`)
  }

  const duel: Duel = {
    attackerCard: combat.revealedCard,
    defenderCard,
  }

  const defenderPool = combat.defenderPool.filter((card) => card.id !== defenderCardId)

  if (combat.revealedCard.power === defenderCard.power) {
    return {
      ...combat,
      defenderPool,
      revealedCard: null,
      pendingTies: [...combat.pendingTies, duel],
    }
  }

  const winner = combat.revealedCard.power > defenderCard.power ? 'attacker' : 'defender'
  const resolved = resolveDuels([...combat.pendingTies, duel], winner)

  return {
    ...combat,
    defenderPool,
    revealedCard: null,
    pendingTies: [],
    resolvedDuels: [...combat.resolvedDuels, ...resolved],
  }
}

/**
 * Returns true once no unrevealed attacker cards remain and no duel is waiting for defender input.
 */
export function isCombatFinished(combat: CombatState): boolean {
  return combat.attackerQueue.length === 0 && combat.revealedCard === null
}

/**
 * Resolves any end-of-battle tied duels, which default to defender victories per the spec.
 */
export function finalizeCombat(combat: CombatState): CombatState {
  if (!isCombatFinished(combat)) {
    throw new Error('Cannot finalize combat before all attacker cards have been processed.')
  }

  if (combat.pendingTies.length === 0) {
    return combat
  }

  return {
    ...combat,
    pendingTies: [],
    resolvedDuels: [...combat.resolvedDuels, ...resolveDuels(combat.pendingTies, 'defender')],
  }
}
