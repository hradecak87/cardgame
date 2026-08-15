'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export function getAutoAdvanceAction(state: GameState): AutoAdvanceAction | null {
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
  actions: {
    startNewGame: () => void
    confirmDefenderSelection: (selectedCardIds: string[]) => void
    revealNextAttacker: () => void
    selectDefenderCard: (cardId: string) => void
    advanceRound: () => void
  }
} {
  const [state, setState] = useState<GameState>(HYDRATION_PLACEHOLDER_STATE)
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
    setIsReady(true)
  }, [replaceState])

  const confirmDefenderSelection = useCallback(
    (selectedCardIds: string[]) => {
      updateState((currentState) => beginRound(currentState, selectedCardIds))
    },
    [updateState],
  )

  const revealNextAttacker = useCallback(() => {
    updateState((currentState) => advanceCombat(currentState))
  }, [updateState])

  const selectDefenderCard = useCallback(
    (cardId: string) => {
      updateState((currentState) => advanceCombat(currentState, cardId))
    },
    [updateState],
  )

  const advanceRound = useCallback(() => {
    updateState((currentState) => processRoundEnd(currentState))
  }, [updateState])

  useEffect(() => {
    const storedState = loadStoredGameState(window.localStorage.getItem(STORAGE_KEY))
    replaceState(storedState ?? createNewGameState())
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

    const action = getAutoAdvanceAction(state)

    if (!action) {
      return
    }

    const delay =
      action === 'finish-round' ? 850 : action === 'resolve-npc-defense' ? 700 : 650

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

      advanceRound()
    }, delay)

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [advanceRound, isReady, revealNextAttacker, state, updateState])

  return {
    state,
    actions: {
      startNewGame,
      confirmDefenderSelection,
      revealNextAttacker,
      selectDefenderCard,
      advanceRound,
    },
  }
}
