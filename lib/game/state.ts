import { assignDefenderCard, buildCombatState, finalizeCombat, isCombatFinished, revealNextAttacker } from './combat'
import { dealHands, createDeck } from './deck'
import { npcSelectDefense } from './npc'
import { addWinnersToRest, ageRestingCards } from './rest'
import { DIFFICULTY_CONFIG } from './types'
import type { Army, Card, Difficulty, GameState, ResolvedDuel, RoundStartSnapshot, Side } from './types'

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

function cloneArmy(army: Army): Army {
  return {
    available: [...army.available],
    resting: army.resting.map((entry) => ({
      card: entry.card,
      roundsRemaining: entry.roundsRemaining,
    })),
  }
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

function playerLostDuel(attackerSide: Side, duel: ResolvedDuel): boolean {
  return attackerSide === 'player' ? duel.winner === 'defender' : duel.winner === 'attacker'
}

function shouldAllowRoundRedo(difficulty: Difficulty): boolean {
  return difficulty === 'easy'
}

function createRoundStartSnapshot(state: GameState): RoundStartSnapshot {
  return {
    player: cloneArmy(state.player),
    npc: cloneArmy(state.npc),
    attackerSide: state.attackerSide,
  }
}

export function playerLostAnyDuel(state: GameState): boolean {
  if (!state.combat) {
    return false
  }

  return state.combat.resolvedDuels.some((duel) => playerLostDuel(state.attackerSide, duel))
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
    roundRedoAvailable: shouldAllowRoundRedo(difficulty),
    roundStartSnapshot: null,
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
      roundStartSnapshot: null,
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
    roundStartSnapshot:
      state.roundRedoAvailable && state.difficulty === 'easy' ? createRoundStartSnapshot(state) : null,
    phase: 'combat',
    combat,
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

  return {
    ...state,
    combat: assignDefenderCard(combat, selectedCardId),
  }
}

export function finalizeCombatState(state: GameState): GameState {
  if (state.phase !== 'combat' || !state.combat) {
    throw new Error('Combat can only be finalized while a combat state is active.')
  }

  const finalizedCombat = finalizeCombat(state.combat)

  if (finalizedCombat === state.combat) {
    return state
  }

  return {
    ...state,
    combat: finalizedCombat,
  }
}

export function canRedoRound(state: GameState): boolean {
  return (
    state.phase === 'combat' &&
    Boolean(state.combat) &&
    state.difficulty === 'easy' &&
    state.roundRedoAvailable &&
    state.roundStartSnapshot !== null &&
    playerLostAnyDuel(state)
  )
}

export function redoRound(state: GameState): GameState {
  if (!canRedoRound(state) || !state.roundStartSnapshot) {
    throw new Error('There is no round redo available.')
  }

  return {
    player: cloneArmy(state.roundStartSnapshot.player),
    npc: cloneArmy(state.roundStartSnapshot.npc),
    difficulty: state.difficulty,
    roundRedoAvailable: false,
    roundStartSnapshot: null,
    attackerSide: state.roundStartSnapshot.attackerSide,
    phase: 'selecting',
    combat: null,
    winner: null,
  }
}

/**
 * Finalizes combat, applies captured-card ownership transfer, ages existing rest cards, and either swaps roles or ends the game.
 */
export function processRoundEnd(state: GameState): GameState {
  if (state.phase !== 'combat' || !state.combat) {
    throw new Error('Round end can only be processed from the combat phase.')
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
    roundRedoAvailable: state.roundRedoAvailable,
    roundStartSnapshot: null,
    attackerSide: winner ? state.attackerSide : defenderSide,
    phase: winner ? 'game-over' : 'selecting',
    combat: null,
    winner,
  }
}
