import {
  DEFAULT_SELECTED_DIFFICULTY,
  dismissRoundResult,
  getAutoAdvanceAction,
  hydrateGameSession,
  isValidGameStateShape,
  loadStoredDifficulty,
  loadStoredGameState,
  prepareRoundResult,
  startGameWithDifficulty,
} from './useGameState'
import type { Army, Card, GameState } from '@/lib/game/types'

function createCard(id: string, power: number): Card {
  return {
    id,
    rank: '7',
    suit: 'hearts',
    power,
  }
}

function createArmy(available: Card[], resting: Army['resting'] = []): Army {
  return { available, resting }
}

function createState(overrides: Partial<GameState> = {}): GameState {
  return {
    player: createArmy([]),
    npc: createArmy([]),
    attackerSide: 'npc',
    phase: 'selecting',
    combat: null,
    winner: null,
    difficulty: 'easy',
    duelRedosRemaining: 1,
    pendingDuelRedo: null,
    ...overrides,
  }
}

describe('useGameState helpers', () => {
  test('accepts valid saved game state and rejects invalid payloads', () => {
    const validState = createState({
      player: createArmy([createCard('p1', 2)]),
      npc: createArmy([createCard('n1', 4)]),
    })

    expect(isValidGameStateShape(validState)).toBe(true)
    expect(loadStoredGameState(JSON.stringify(validState))).toEqual(validState)

    expect(isValidGameStateShape(null)).toBe(false)
    expect(isValidGameStateShape({ phase: 'combat' })).toBe(false)
    expect(loadStoredGameState('{"broken":')).toBeNull()
    expect(loadStoredGameState(JSON.stringify({ nope: true }))).toBeNull()
  })

  test('loads a stored difficulty and keeps it ready for the next new game', () => {
    expect(loadStoredDifficulty('easy')).toBe('easy')
    expect(loadStoredDifficulty('normal')).toBe('normal')
    expect(loadStoredDifficulty('expert')).toBe('expert')
    expect(loadStoredDifficulty('marshal')).toBeNull()

    const hydrated = hydrateGameSession(null, 'expert')

    expect(hydrated.selectedDifficulty).toBe('expert')
    expect(hydrated.isDifficultyPickerOpen).toBe(true)
    expect(hydrated.state.player.available).toEqual([])
    expect(hydrated.state.difficulty).toBe(DEFAULT_SELECTED_DIFFICULTY)
  })

  test('hydrateGameSession ignores the placeholder state so the difficulty picker still opens before first game', () => {
    const placeholderState = createState({
      player: createArmy([]),
      npc: createArmy([]),
      difficulty: 'easy',
      duelRedosRemaining: 1,
      pendingDuelRedo: null,
    })

    const hydrated = hydrateGameSession(JSON.stringify(placeholderState), 'normal')

    expect(hydrated.isDifficultyPickerOpen).toBe(true)
    expect(hydrated.selectedDifficulty).toBe('normal')
    expect(hydrated.state.player.available).toEqual([])
    expect(hydrated.state.npc.available).toEqual([])
  })

  test('starting a game with a chosen difficulty applies that deal distribution', () => {
    const state = startGameWithDifficulty('expert', () => 0)

    expect(state.difficulty).toBe('expert')
    expect(state.duelRedosRemaining).toBe(0)
    expect(state.player.available.filter((card) => card.rank === 'A')).toHaveLength(1)
    expect(state.npc.available.filter((card) => card.rank === 'A')).toHaveLength(3)
  })

  test('identifies when the hook should auto-advance NPC turns', () => {
    const attackerCard = createCard('a1', 6)
    const defenderCard = createCard('d1', 4)

    expect(
      getAutoAdvanceAction(
        createState({
          attackerSide: 'player',
          phase: 'selecting',
          player: createArmy([attackerCard]),
          npc: createArmy([defenderCard]),
        }),
      ),
    ).toBe('begin-npc-selection')

    expect(
      getAutoAdvanceAction(
        createState({
          attackerSide: 'player',
          phase: 'combat',
          combat: {
            attackerQueue: [attackerCard],
            revealedCard: null,
            defenderPool: [defenderCard],
            pendingTies: [],
            resolvedDuels: [],
          },
        }),
      ),
    ).toBe('reveal-next-attacker')

    expect(
      getAutoAdvanceAction(
        createState({
          attackerSide: 'player',
          phase: 'combat',
          combat: {
            attackerQueue: [],
            revealedCard: attackerCard,
            defenderPool: [defenderCard],
            pendingTies: [],
            resolvedDuels: [],
          },
        }),
      ),
    ).toBe('resolve-npc-defense')

    expect(
      getAutoAdvanceAction(
        createState({
          attackerSide: 'player',
          phase: 'combat',
          combat: {
            attackerQueue: [],
            revealedCard: null,
            defenderPool: [],
            pendingTies: [],
            resolvedDuels: [],
          },
        }),
      ),
    ).toBe('finish-round')

    expect(
      getAutoAdvanceAction(
        createState({
          attackerSide: 'npc',
          phase: 'combat',
          combat: {
            attackerQueue: [attackerCard],
            revealedCard: null,
            defenderPool: [defenderCard],
            pendingTies: [],
            resolvedDuels: [],
          },
        }),
      ),
    ).toBeNull()
  })

  test('shows a persistent round result before advancing to the next round', () => {
    const attackerCard = createCard('a1', 6)
    const defenderCard = createCard('d1', 4)
    const reservePlayer = createCard('p-reserve', 3)
    const reserveNpc = createCard('n-reserve', 5)
    const finishedCombatState = createState({
      attackerSide: 'player',
      phase: 'combat',
      player: createArmy([reservePlayer]),
      npc: createArmy([reserveNpc]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard,
              defenderCard,
            },
            winner: 'attacker',
          },
        ],
      },
    })

    const { displayState, roundResult } = prepareRoundResult(finishedCombatState)

    expect(displayState.phase).toBe('combat')
    expect(roundResult).not.toBeNull()
    expect(roundResult?.capturedCards).toEqual([defenderCard])
    expect(roundResult?.lostCards).toEqual([])
    expect(roundResult?.nextState.phase).toBe('selecting')
    expect(roundResult?.nextState.attackerSide).toBe('npc')
    expect(roundResult?.nextState.player.resting.map((entry) => entry.card.id)).toEqual([
      attackerCard.id,
      defenderCard.id,
    ])
    expect(getAutoAdvanceAction(displayState, roundResult ?? null)).toBeNull()
    expect(dismissRoundResult(roundResult!)).toEqual(roundResult?.nextState)
  })

  test('builds round results from the player perspective when the NPC attacked', () => {
    const attackerCard = createCard('npc-attacker', 5)
    const defenderCard = createCard('player-defender', 7)
    const finishedCombatState = createState({
      attackerSide: 'npc',
      phase: 'combat',
      player: createArmy([createCard('player-reserve', 3)]),
      npc: createArmy([createCard('npc-reserve', 2)]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard,
              defenderCard,
            },
            winner: 'defender',
          },
        ],
      },
    })

    const { roundResult } = prepareRoundResult(finishedCombatState)

    expect(roundResult?.capturedCards).toEqual([attackerCard])
    expect(roundResult?.lostCards).toEqual([])
    expect(roundResult?.nextState.player.resting.map((entry) => entry.card.id)).toEqual([
      attackerCard.id,
      defenderCard.id,
    ])
  })

  test('prepareRoundResult uses the game difficulty when sending cards to rest', () => {
    const attackerCard = createCard('attacker', 8)
    const defenderCard = createCard('defender', 2)
    const finishedCombatState = createState({
      attackerSide: 'player',
      phase: 'combat',
      difficulty: 'expert',
      duelRedosRemaining: 0,
      player: createArmy([]),
      npc: createArmy([]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard,
              defenderCard,
            },
            winner: 'attacker',
          },
        ],
      },
    })

    const { roundResult } = prepareRoundResult(finishedCombatState)

    expect(roundResult?.nextState.player.resting).toEqual([
      { card: attackerCard, roundsRemaining: 3 },
      { card: defenderCard, roundsRemaining: 3 },
    ])
  })

  test('auto advance pauses while an easy redo prompt is visible', () => {
    const attackerCard = createCard('attacker', 8)
    const defenderCard = createCard('defender', 2)
    const state = createState({
      phase: 'combat',
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard,
              defenderCard,
            },
            winner: 'attacker',
          },
        ],
      },
      pendingDuelRedo: {
        duel: {
          duel: {
            attackerCard,
            defenderCard,
          },
          winner: 'attacker',
        },
      },
    })

    expect(getAutoAdvanceAction(state)).toBeNull()
  })

  test('rejects stored game state with an invalid pending duel redo payload', () => {
    const invalidRedoState = {
      ...createState({
        player: createArmy([createCard('p1', 4)]),
        npc: createArmy([createCard('n1', 6)]),
      }),
      pendingDuelRedo: {
        duel: {
          duel: {
            attackerCard: { id: 'broken' },
            defenderCard: createCard('d1', 2),
          },
          winner: 'attacker',
        },
      },
    }

    expect(loadStoredGameState(JSON.stringify(invalidRedoState))).toBeNull()
  })
})
