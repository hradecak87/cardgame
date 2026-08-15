'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { finalizeCombat, isCombatFinished, revealNextAttacker as revealNextCombatAttacker } from '@/lib/game/combat'
import { npcSelectAttack } from '@/lib/game/npc'
import {
  advanceCombat,
  beginRound,
  canRedoRound,
  computeSlotCount,
  finalizeCombatState,
  processRoundEnd,
  redoRound,
  startNewGame as createNewGameState,
} from '@/lib/game/state'
import type {
  Army,
  Card,
  CombatState,
  Difficulty,
  GamePhase,
  GameState,
  RoundStartSnapshot,
  RestingCard,
  Side,
} from '@/lib/game/types'

export const STORAGE_KEY = 'battle-card-game-state'
export const DIFFICULTY_STORAGE_KEY = 'battle-card-game-difficulty'
export const DEFAULT_SELECTED_DIFFICULTY: Difficulty = 'easy'

type AutoAdvanceAction =
  | 'begin-npc-selection'
  | 'skip-empty-round'
  | 'reveal-next-attacker'
  | 'resolve-npc-defense'
  | 'finalize-combat'
  | 'finish-round'

export interface RoundResultState {
  capturedCards: Card[]
  lostCards: Card[]
  canRedoRound: boolean
  nextState: GameState
  redoState: GameState | null
}

const HYDRATION_PLACEHOLDER_STATE: GameState = {
  player: { available: [], resting: [] },
  npc: { available: [], resting: [] },
  difficulty: DEFAULT_SELECTED_DIFFICULTY,
  roundRedoAvailable: true,
  roundStartSnapshot: null,
  attackerSide: 'npc',
  phase: 'selecting',
  combat: null,
  winner: null,
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'expert'
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Card>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.rank === 'string' &&
    typeof candidate.suit === 'string' &&
    typeof candidate.power === 'number'
  )
}

function isRestingCard(value: unknown): value is RestingCard {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<RestingCard>

  return isCard(candidate.card) && typeof candidate.roundsRemaining === 'number'
}

function isArmy(value: unknown): value is Army {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Army>

  return (
    Array.isArray(candidate.available) &&
    candidate.available.every(isCard) &&
    Array.isArray(candidate.resting) &&
    candidate.resting.every(isRestingCard)
  )
}

function isCombatState(value: unknown): value is CombatState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<CombatState>

  return (
    Array.isArray(candidate.attackerQueue) &&
    candidate.attackerQueue.every(isCard) &&
    (candidate.revealedCard === null || isCard(candidate.revealedCard)) &&
    Array.isArray(candidate.defenderPool) &&
    candidate.defenderPool.every(isCard) &&
    Array.isArray(candidate.pendingTies) &&
    candidate.pendingTies.every(
      (duel) =>
        Boolean(duel) &&
        typeof duel === 'object' &&
        isCard((duel as { attackerCard?: unknown }).attackerCard) &&
        isCard((duel as { defenderCard?: unknown }).defenderCard),
    ) &&
    Array.isArray(candidate.resolvedDuels) &&
    candidate.resolvedDuels.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        ((entry as { winner?: unknown }).winner === 'attacker' ||
          (entry as { winner?: unknown }).winner === 'defender') &&
        Boolean((entry as { duel?: unknown }).duel) &&
        typeof (entry as { duel?: unknown }).duel === 'object' &&
        isCard(((entry as { duel: { attackerCard?: unknown } }).duel).attackerCard) &&
        isCard(((entry as { duel: { defenderCard?: unknown } }).duel).defenderCard),
    )
  )
}

function isRoundStartSnapshot(value: unknown): value is RoundStartSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<RoundStartSnapshot>

  return (
    isArmy(candidate.player) &&
    isArmy(candidate.npc) &&
    (candidate.attackerSide === 'player' || candidate.attackerSide === 'npc')
  )
}

function isPlaceholderState(state: GameState): boolean {
  return (
    state.player.available.length === 0 &&
    state.player.resting.length === 0 &&
    state.npc.available.length === 0 &&
    state.npc.resting.length === 0 &&
    state.combat === null &&
    state.phase === 'selecting'
  )
}

export function isValidGameStateShape(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GameState>
  const validPhases: GamePhase[] = ['selecting', 'combat', 'round-end', 'game-over']
  const validSides: Side[] = ['player', 'npc']

  return (
    isArmy(candidate.player) &&
    isArmy(candidate.npc) &&
    isDifficulty(candidate.difficulty) &&
    typeof candidate.roundRedoAvailable === 'boolean' &&
    (candidate.roundStartSnapshot === null || isRoundStartSnapshot(candidate.roundStartSnapshot)) &&
    typeof candidate.phase === 'string' &&
    validPhases.includes(candidate.phase as GamePhase) &&
    typeof candidate.attackerSide === 'string' &&
    validSides.includes(candidate.attackerSide as Side) &&
    (candidate.winner === null || validSides.includes(candidate.winner as Side)) &&
    (candidate.combat === null || isCombatState(candidate.combat))
  )
}

export function loadStoredGameState(rawValue: string | null): GameState | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    return isValidGameStateShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function loadStoredDifficulty(rawValue: string | null): Difficulty | null {
  return isDifficulty(rawValue) ? rawValue : null
}

export function startGameWithDifficulty(
  difficulty: Difficulty,
  rng: () => number = Math.random,
): GameState {
  return createNewGameState(difficulty, rng)
}

export function hydrateGameSession(
  rawState: string | null,
  rawDifficulty: string | null,
): {
  state: GameState
  selectedDifficulty: Difficulty
  isDifficultyPickerOpen: boolean
} {
  const storedState = loadStoredGameState(rawState)

  if (storedState && !isPlaceholderState(storedState)) {
    return {
      state: storedState,
      selectedDifficulty: storedState.difficulty,
      isDifficultyPickerOpen: false,
    }
  }

  return {
    state: HYDRATION_PLACEHOLDER_STATE,
    selectedDifficulty: loadStoredDifficulty(rawDifficulty) ?? DEFAULT_SELECTED_DIFFICULTY,
    isDifficultyPickerOpen: true,
  }
}

function getDefenderSide(attackerSide: Side): Side {
  return attackerSide === 'player' ? 'npc' : 'player'
}

function buildRoundResultCards(state: GameState): Pick<RoundResultState, 'capturedCards' | 'lostCards'> {
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

export function prepareRoundResult(state: GameState): { displayState: GameState; roundResult: RoundResultState | null } {
  if (state.phase !== 'combat' || !state.combat) {
    return {
      displayState: state,
      roundResult: null,
    }
  }

  const finalizedCombat = finalizeCombat(state.combat)
  const displayState =
    finalizedCombat === state.combat
      ? state
      : {
          ...state,
          combat: finalizedCombat,
        }

  if (!isCombatFinished(finalizedCombat) || finalizedCombat.resolvedDuels.length === 0) {
    return {
      displayState,
      roundResult: null,
    }
  }

  return {
    displayState,
    roundResult: {
      ...buildRoundResultCards(displayState),
      canRedoRound: canRedoRound(displayState),
      nextState: processRoundEnd(displayState),
      redoState: canRedoRound(displayState) ? redoRound(displayState) : null,
    },
  }
}

export function dismissRoundResult(roundResult: RoundResultState): GameState {
  return roundResult.nextState
}

export function redoRoundResult(roundResult: RoundResultState): GameState {
  if (!roundResult.canRedoRound || !roundResult.redoState) {
    throw new Error('There is no round redo available in this round result.')
  }

  return roundResult.redoState
}

export function getAutoAdvanceAction(
  state: GameState,
  roundResult: RoundResultState | null = null,
): AutoAdvanceAction | null {
  if (roundResult) {
    return null
  }

  if (state.phase === 'game-over') {
    return null
  }

  if (state.phase === 'selecting') {
    if (computeSlotCount(state) === 0) {
      return 'skip-empty-round'
    }

    if (state.attackerSide === 'player') {
      return 'begin-npc-selection'
    }

    return null
  }

  if (state.phase !== 'combat' || !state.combat) {
    return null
  }

  if (!state.combat.revealedCard && state.combat.attackerQueue.length === 0) {
    if (state.combat.pendingTies.length > 0) {
      return 'finalize-combat'
    }

    return 'finish-round'
  }

  const defenderSide = getDefenderSide(state.attackerSide)

  if (defenderSide !== 'npc') {
    return null
  }

  if (state.combat.revealedCard) {
    return 'resolve-npc-defense'
  }

  if (state.combat.attackerQueue.length > 0) {
    return 'reveal-next-attacker'
  }

  return 'finish-round'
}

function buildNpcDefenderSelection(state: GameState, rng: () => number): string[] {
  const slotCount = computeSlotCount(state)

  if (slotCount <= 0) {
    return []
  }

  return npcSelectAttack(state.npc.available, slotCount, rng).map((card) => card.id)
}

export function useGameState(): {
  state: GameState
  roundResult: RoundResultState | null
  selectedDifficulty: Difficulty
  isDifficultyPickerOpen: boolean
  isHydrated: boolean
  actions: {
    openDifficultyPicker: () => void
    closeDifficultyPicker: () => void
    startNewGame: (difficulty?: Difficulty) => void
    confirmDefenderSelection: (selectedCardIds: string[]) => void
    revealNextAttacker: () => void
    selectDefenderCard: (cardId: string) => void
    redoRound: () => void
    dismissRoundResult: () => void
  }
} {
  const [state, setState] = useState<GameState>(HYDRATION_PLACEHOLDER_STATE)
  const [roundResult, setRoundResult] = useState<RoundResultState | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(DEFAULT_SELECTED_DIFFICULTY)
  const [isDifficultyPickerOpen, setIsDifficultyPickerOpen] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const replaceState = useCallback((nextState: GameState) => {
    setState(nextState)
  }, [])

  const updateState = useCallback((updater: (currentState: GameState) => GameState) => {
    setState((currentState) => updater(currentState))
  }, [])

  const startNewGame = useCallback((difficulty: Difficulty = selectedDifficulty) => {
    replaceState(startGameWithDifficulty(difficulty))
    setSelectedDifficulty(difficulty)
    setRoundResult(null)
    setIsDifficultyPickerOpen(false)
    setIsReady(true)
  }, [replaceState, selectedDifficulty])

  const openDifficultyPicker = useCallback(() => {
    setSelectedDifficulty(state.difficulty)
    setIsDifficultyPickerOpen(true)
  }, [state.difficulty])

  const closeDifficultyPicker = useCallback(() => {
    if (state.player.available.length + state.player.resting.length + state.npc.available.length + state.npc.resting.length === 0) {
      return
    }

    setIsDifficultyPickerOpen(false)
  }, [state.npc.available.length, state.npc.resting.length, state.player.available.length, state.player.resting.length])

  const confirmDefenderSelection = useCallback(
    (selectedCardIds: string[]) => {
      updateState((currentState) => beginRound(currentState, selectedCardIds))
    },
    [updateState],
  )

  const revealNextAttacker = useCallback(() => {
    updateState((currentState) => {
      if (currentState.phase !== 'combat' || !currentState.combat) {
        return currentState
      }

      return {
        ...currentState,
        combat: revealNextCombatAttacker(currentState.combat),
      }
    })
  }, [updateState])

  const selectDefenderCard = useCallback(
    (cardId: string) => {
      updateState((currentState) => advanceCombat(currentState, cardId))
    },
    [updateState],
  )

  const handleRedoRound = useCallback(() => {
    if (!roundResult) {
      return
    }

    replaceState(redoRoundResult(roundResult))
    setRoundResult(null)
  }, [replaceState, roundResult])

  const handleDismissRoundResult = useCallback(() => {
    if (!roundResult) {
      return
    }

    replaceState(dismissRoundResult(roundResult))
    setRoundResult(null)
  }, [replaceState, roundResult])

  useEffect(() => {
    const hydratedSession = hydrateGameSession(
      window.localStorage.getItem(STORAGE_KEY),
      window.localStorage.getItem(DIFFICULTY_STORAGE_KEY),
    )

    replaceState(hydratedSession.state)
    setSelectedDifficulty(hydratedSession.selectedDifficulty)
    setIsDifficultyPickerOpen(hydratedSession.isDifficultyPickerOpen)
    setRoundResult(null)
    setIsReady(true)
  }, [replaceState])

  useEffect(() => {
    if (!isReady) {
      return
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, selectedDifficulty)
  }, [isReady, selectedDifficulty, state])

  useEffect(() => {
    if (!isReady) {
      return
    }

    const action = getAutoAdvanceAction(state, roundResult)

    if (!action) {
      return
    }

    const delay =
      action === 'finish-round' ? 950 : action === 'resolve-npc-defense' ? 1000 : 850

    timeoutRef.current = window.setTimeout(() => {
      if (action === 'skip-empty-round') {
        updateState((currentState) => beginRound(currentState))
        return
      }

      if (action === 'begin-npc-selection') {
        updateState((currentState) =>
          beginRound(currentState, buildNpcDefenderSelection(currentState, Math.random), Math.random),
        )
        return
      }

      if (action === 'reveal-next-attacker') {
        revealNextAttacker()
        return
      }

      if (action === 'resolve-npc-defense') {
        updateState((currentState) => advanceCombat(currentState))
        return
      }

      if (action === 'finalize-combat') {
        updateState((currentState) => finalizeCombatState(currentState))
        return
      }

      const { displayState, roundResult: nextRoundResult } = prepareRoundResult(state)
      replaceState(displayState)
      setRoundResult(nextRoundResult)
    }, delay)

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isReady, replaceState, revealNextAttacker, roundResult, state, updateState])

  return {
    state,
    roundResult,
    selectedDifficulty,
    isDifficultyPickerOpen,
    isHydrated: isReady,
    actions: {
      openDifficultyPicker,
      closeDifficultyPicker,
      startNewGame,
      confirmDefenderSelection,
      revealNextAttacker,
      selectDefenderCard,
      redoRound: handleRedoRound,
      dismissRoundResult: handleDismissRoundResult,
    },
  }
}
