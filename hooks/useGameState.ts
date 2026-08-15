'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { finalizeCombat, isCombatFinished, revealNextAttacker as revealNextCombatAttacker } from '@/lib/game/combat'
import { npcSelectAttack } from '@/lib/game/npc'
import { advanceCombat, beginRound, computeSlotCount, processRoundEnd, startNewGame as createNewGameState } from '@/lib/game/state'
import type { Army, Card, CombatState, GamePhase, GameState, RestingCard, Side } from '@/lib/game/types'

export const STORAGE_KEY = 'battle-card-game-state'

type AutoAdvanceAction =
  | 'begin-npc-selection'
  | 'skip-empty-round'
  | 'reveal-next-attacker'
  | 'resolve-npc-defense'
  | 'finish-round'

export interface RoundResultState {
  capturedCards: Card[]
  lostCards: Card[]
  nextState: GameState
}

const HYDRATION_PLACEHOLDER_STATE: GameState = {
  player: { available: [], resting: [] },
  npc: { available: [], resting: [] },
  attackerSide: 'npc',
  phase: 'selecting',
  combat: null,
  winner: null,
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
      nextState: processRoundEnd(displayState),
    },
  }
}

export function dismissRoundResult(roundResult: RoundResultState): GameState {
  return roundResult.nextState
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
  actions: {
    startNewGame: () => void
    confirmDefenderSelection: (selectedCardIds: string[]) => void
    revealNextAttacker: () => void
    selectDefenderCard: (cardId: string) => void
    dismissRoundResult: () => void
  }
} {
  const [state, setState] = useState<GameState>(HYDRATION_PLACEHOLDER_STATE)
  const [roundResult, setRoundResult] = useState<RoundResultState | null>(null)
  const [isReady, setIsReady] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const replaceState = useCallback((nextState: GameState) => {
    setState(nextState)
  }, [])

  const updateState = useCallback((updater: (currentState: GameState) => GameState) => {
    setState((currentState) => updater(currentState))
  }, [])

  const startNewGame = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }

    replaceState(createNewGameState())
    setRoundResult(null)
    setIsReady(true)
  }, [replaceState])

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

  const handleDismissRoundResult = useCallback(() => {
    if (!roundResult) {
      return
    }

    replaceState(dismissRoundResult(roundResult))
    setRoundResult(null)
  }, [replaceState, roundResult])

  useEffect(() => {
    const storedState = loadStoredGameState(window.localStorage.getItem(STORAGE_KEY))
    replaceState(storedState ?? createNewGameState())
    setRoundResult(null)
    setIsReady(true)
  }, [replaceState])

  useEffect(() => {
    if (!isReady) {
      return
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [isReady, state])

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
    actions: {
      startNewGame,
      confirmDefenderSelection,
      revealNextAttacker,
      selectDefenderCard,
      dismissRoundResult: handleDismissRoundResult,
    },
  }
}
