import { assignDefenderCard, buildCombatState, finalizeCombat, isCombatFinished, revealNextAttacker } from './combat'
import { dealHands, createDeck } from './deck'
import { npcSelectDefense } from './npc'
import { addWinnersToRest, ageRestingCards } from './rest'
import { DIFFICULTY_CONFIG } from './types'
import type { Army, Card, Difficulty, GameState, PendingDuelRedo, ResolvedDuel, Side } from './types'

function getDefenderSide(attackerSide: Side): Side {
  return attackerSide === 'player' ? 'npc' : 'player'
}

function getArmyForSide(state: GameState, side: Side): Army {
  return state[side]
}

function replaceArmies(state: GameState, player: Army, npc: Army): GameState {
  return {
    ...state,
    player,
    npc,
  }
}

function removeCards(available: Card[], selectedCards: Card[]): Card[] {
  const selectedIds = new Set(selectedCards.map((card) => card.id))
  return available.filter((card) => !selectedIds.has(card.id))
}

function removeCardById(available: Card[], cardId: string): Card[] {
  return available.filter((card) => card.id !== cardId)
}

function drawRandomCard(available: Card[], rng: () => number): Card {
  if (available.length === 0) {
    throw new Error('Cannot draw from an empty card pool.')
  }

  const cardIndex = Math.floor(rng() * available.length)
  return available[cardIndex]
}

function totalArmySize(army: Army): number {
  return army.available.length + army.resting.length
}

function determineWinner(player: Army, npc: Army): Side | null {
  if (totalArmySize(player) === 0) {
    return 'npc'
  }

  if (totalArmySize(npc) === 0) {
    return 'player'
  }

  return null
}

function ageArmies(player: Army, npc: Army): { player: Army; npc: Army } {
  return {
    player: ageRestingCards(player),
    npc: ageRestingCards(npc),
  }
}

function getInitialDuelRedoCount(difficulty: Difficulty): 0 | 1 {
  return difficulty === 'easy' ? 1 : 0
}

function playerLostDuel(attackerSide: Side, duel: ResolvedDuel): boolean {
  return attackerSide === 'player' ? duel.winner === 'defender' : duel.winner === 'attacker'
}

function findPendingDuelRedo(
  state: GameState,
  newlyResolvedDuels: ResolvedDuel[],
): PendingDuelRedo | null {
  if (
    state.difficulty !== 'easy' ||
    state.duelRedosRemaining === 0 ||
    getArmyForSide(state, state.attackerSide).available.length === 0
  ) {
    return null
  }

  for (let index = newlyResolvedDuels.length - 1; index >= 0; index -= 1) {
    const duel = newlyResolvedDuels[index]

    if (playerLostDuel(state.attackerSide, duel)) {
      return { duel }
    }
  }

  return null
}

function applyPendingDuelRedo(
  previousState: GameState,
  nextCombat: GameState['combat'],
  previousResolvedCount: number,
): GameState {
  if (!nextCombat) {
    return {
      ...previousState,
      combat: null,
      pendingDuelRedo: null,
    }
  }

  const pendingDuelRedo = findPendingDuelRedo(
    previousState,
    nextCombat.resolvedDuels.slice(previousResolvedCount),
  )

  return {
    ...previousState,
    combat: nextCombat,
    pendingDuelRedo,
  }
}

function replaceResolvedDuel(resolvedDuels: ResolvedDuel[], duelToRemove: ResolvedDuel): ResolvedDuel[] {
  const duelIndex = resolvedDuels.findIndex(
    (entry) =>
      entry.winner === duelToRemove.winner &&
      entry.duel.attackerCard.id === duelToRemove.duel.attackerCard.id &&
      entry.duel.defenderCard.id === duelToRemove.duel.defenderCard.id,
  )

  if (duelIndex === -1) {
    throw new Error('The pending duel redo no longer matches the combat history.')
  }

  return resolvedDuels.filter((_, index) => index !== duelIndex)
}

/**
 * Creates a fresh game state by building, shuffling, and dealing the 32-card deck.
 */
export function startNewGame(
  difficulty: Difficulty = 'easy',
  rng: () => number = Math.random,
): GameState {
  const { player, npc } = dealHands(createDeck(), difficulty, rng)

  return {
    player,
    npc,
    difficulty,
    duelRedosRemaining: getInitialDuelRedoCount(difficulty),
    pendingDuelRedo: null,
    attackerSide: 'npc',
    phase: 'selecting',
    combat: null,
    winner: null,
  }
}

/**
 * Computes the number of battle slots available for the current attacker/defender pairing.
 */
export function computeSlotCount(state: GameState): number {
  const attacker = getArmyForSide(state, state.attackerSide)
  const defender = getArmyForSide(state, getDefenderSide(state.attackerSide))

  return Math.min(3, attacker.available.length, defender.available.length)
}

/**
 * Starts a round by either aging a skipped round or moving selected cards into combat.
 */
export function beginRound(
  state: GameState,
  defenderCardIds: string[] = [],
  rng: () => number = Math.random,
): GameState {
  if (state.phase !== 'selecting') {
    throw new Error('A new round can only begin from the selecting phase.')
  }

  const slotCount = computeSlotCount(state)

  if (slotCount === 0) {
    const aged = ageArmies(state.player, state.npc)
    const winner = determineWinner(aged.player, aged.npc)

    return {
      ...state,
      ...aged,
      phase: winner ? 'game-over' : 'selecting',
      winner,
      combat: null,
    }
  }

  const defenderSide = getDefenderSide(state.attackerSide)
  const attackerArmy = getArmyForSide(state, state.attackerSide)
  const defenderArmy = getArmyForSide(state, defenderSide)
  const combat = buildCombatState(
    attackerArmy.available,
    defenderArmy.available,
    defenderCardIds,
    slotCount,
    rng,
  )
  const attackerCards = [...combat.attackerQueue]
  const nextAttackerArmy: Army = {
    ...attackerArmy,
    available: removeCards(attackerArmy.available, attackerCards),
  }
  const nextDefenderArmy: Army = {
    ...defenderArmy,
    available: removeCards(defenderArmy.available, combat.defenderPool),
  }
  const nextPlayer = state.attackerSide === 'player' ? nextAttackerArmy : nextDefenderArmy
  const nextNpc = state.attackerSide === 'npc' ? nextAttackerArmy : nextDefenderArmy

  return {
    ...replaceArmies(state, nextPlayer, nextNpc),
    phase: 'combat',
    combat,
    pendingDuelRedo: null,
    winner: null,
  }
}

/**
 * Advances combat by at most one duel, revealing the next attacker card and optionally resolving it.
 */
export function advanceCombat(
  state: GameState,
  defenderCardId?: string,
): GameState {
  if (state.phase !== 'combat' || !state.combat) {
    throw new Error('Combat can only advance while a combat state is active.')
  }

  const defenderSide = getDefenderSide(state.attackerSide)
  let combat = state.combat

  if (!combat.revealedCard) {
    combat = revealNextAttacker(combat)
  }

  if (!combat.revealedCard) {
    return {
      ...state,
      combat,
    }
  }

  const selectedCardId =
    defenderSide === 'npc'
      ? npcSelectDefense(combat.defenderPool, combat.revealedCard).id
      : defenderCardId

  if (!selectedCardId) {
    return {
      ...state,
      combat,
    }
  }

  return applyPendingDuelRedo(state, assignDefenderCard(combat, selectedCardId), combat.resolvedDuels.length)
}

export function finalizeCombatState(state: GameState): GameState {
  if (state.phase !== 'combat' || !state.combat) {
    throw new Error('Combat can only be finalized while a combat state is active.')
  }

  const finalizedCombat = finalizeCombat(state.combat)

  if (finalizedCombat === state.combat) {
    return state
  }

  return applyPendingDuelRedo(state, finalizedCombat, state.combat.resolvedDuels.length)
}

export function redoPendingDuel(state: GameState, rng: () => number = Math.random): GameState {
  if (state.phase !== 'combat' || !state.combat || !state.pendingDuelRedo) {
    throw new Error('There is no duel redo available.')
  }

  const attackerSide = state.attackerSide
  const defenderSide = getDefenderSide(attackerSide)
  const attackerArmy = getArmyForSide(state, attackerSide)
  const originalAttackerCard = state.pendingDuelRedo.duel.duel.attackerCard
  const originalDefenderCard = state.pendingDuelRedo.duel.duel.defenderCard

  if (attackerArmy.available.length === 0) {
    throw new Error('Cannot redo a duel without a replacement attacker card.')
  }

  const actualReplacement = drawRandomCard(attackerArmy.available, rng)
  const nextAttackerArmy: Army = {
    ...attackerArmy,
    available: [...removeCardById(attackerArmy.available, actualReplacement.id), originalAttackerCard],
  }
  const nextPlayer = attackerSide === 'player' ? nextAttackerArmy : state.player
  const nextNpc = attackerSide === 'npc' ? nextAttackerArmy : state.npc
  const redoneCombat = {
    ...state.combat,
    revealedCard: actualReplacement,
    defenderPool: [...state.combat.defenderPool, originalDefenderCard],
    resolvedDuels: replaceResolvedDuel(state.combat.resolvedDuels, state.pendingDuelRedo.duel),
  }
  const redoneState: GameState = {
    ...state,
    player: nextPlayer,
    npc: nextNpc,
    duelRedosRemaining: 0,
    pendingDuelRedo: null,
    combat: redoneCombat,
  }

  if (defenderSide === 'npc') {
    return advanceCombat(redoneState)
  }

  return redoneState
}

export function forfeitPendingDuelRedo(state: GameState): GameState {
  if (!state.pendingDuelRedo) {
    return state
  }

  return {
    ...state,
    duelRedosRemaining: 0,
    pendingDuelRedo: null,
  }
}

/**
 * Finalizes combat, applies captured-card ownership transfer, ages existing rest cards, and either swaps roles or ends the game.
 */
export function processRoundEnd(state: GameState): GameState {
  if (state.phase !== 'combat' || !state.combat) {
    throw new Error('Round end can only be processed from the combat phase.')
  }

  if (state.pendingDuelRedo) {
    throw new Error('Round end cannot be processed while a duel redo is pending.')
  }

  const combat = finalizeCombat(state.combat)

  if (!isCombatFinished(combat)) {
    throw new Error('Round end requires combat to be fully resolved.')
  }

  const aged = ageArmies(state.player, state.npc)
  const attackerSide = state.attackerSide
  const defenderSide = getDefenderSide(attackerSide)

  const attackerWonCards = combat.resolvedDuels
    .filter((entry) => entry.winner === 'attacker')
    .flatMap((entry) => [entry.duel.attackerCard, entry.duel.defenderCard])
  const defenderWonCards = combat.resolvedDuels
    .filter((entry) => entry.winner === 'defender')
    .flatMap((entry) => [entry.duel.attackerCard, entry.duel.defenderCard])

  const restRounds = DIFFICULTY_CONFIG[state.difficulty].restRounds
  const nextAttackerArmy = addWinnersToRest(
    getArmyForSide({ ...state, ...aged }, attackerSide),
    attackerWonCards,
    restRounds,
  )
  const nextDefenderArmy = addWinnersToRest(
    getArmyForSide({ ...state, ...aged }, defenderSide),
    defenderWonCards,
    restRounds,
  )
  const nextPlayer = attackerSide === 'player' ? nextAttackerArmy : nextDefenderArmy
  const nextNpc = attackerSide === 'npc' ? nextAttackerArmy : nextDefenderArmy
  const winner = determineWinner(nextPlayer, nextNpc)

  return {
    player: nextPlayer,
    npc: nextNpc,
    difficulty: state.difficulty,
    duelRedosRemaining: state.duelRedosRemaining,
    pendingDuelRedo: null,
    attackerSide: winner ? state.attackerSide : defenderSide,
    phase: winner ? 'game-over' : 'selecting',
    combat: null,
    winner,
  }
}
