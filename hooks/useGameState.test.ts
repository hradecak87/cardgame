import {
  DEFAULT_SELECTED_DIFFICULTY,
  dismissRoundResult,
  getAutoAdvanceAction,
  hydrateGameSession,
  isValidGameStateShape,
  loadStoredDifficulty,
  loadStoredGameState,
  prepareRoundResult,
  redoRoundResult,
  startGameWithDifficulty,
} from './useGameState'
import type { Army, Card, GameState, Side } from '@/lib/game/types'

type RoundSnapshot = {
  player: Army
  npc: Army
  attackerSide: Side
}

type TestGameState = GameState & {
  roundRedoAvailable?: boolean
  roundStartSnapshot?: RoundSnapshot | null
}

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

function createState(overrides: Partial<TestGameState> = {}): TestGameState {
  return {
    player: createArmy([]),
    npc: createArmy([]),
    attackerSide: 'npc',
    phase: 'selecting',
    combat: null,
    winner: null,
    difficulty: 'easy',
    roundRedoAvailable: true,
    roundStartSnapshot: null,
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
      roundRedoAvailable: true,
      roundStartSnapshot: null,
    })

    const hydrated = hydrateGameSession(JSON.stringify(placeholderState), 'normal')

    expect(hydrated.isDifficultyPickerOpen).toBe(true)
    expect(hydrated.selectedDifficulty).toBe('normal')
    expect(hydrated.state.player.available).toEqual([])
    expect(hydrated.state.npc.available).toEqual([])
  })

  test('starting a game with a chosen difficulty applies that deal distribution', () => {
    const state = startGameWithDifficulty('expert', () => 0) as TestGameState

    expect(state.difficulty).toBe('expert')
    expect(state.roundRedoAvailable).toBe(false)
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
    expect(roundResult?.canRedoRound).toBe(false)
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

  test('round result exposes a redo option only when the player lost at least one duel on easy', () => {
    const playerCard = createCard('player-attacker', 2)
    const npcCard = createCard('npc-defender', 7)
    const roundStartSnapshot: RoundSnapshot = {
      attackerSide: 'player',
      player: createArmy([playerCard, createCard('player-reserve', 5)]),
      npc: createArmy([npcCard, createCard('npc-reserve', 4)]),
    }
    const finishedCombatState = createState({
      attackerSide: 'player',
      phase: 'combat',
      difficulty: 'easy',
      roundRedoAvailable: true,
      roundStartSnapshot,
      player: createArmy([createCard('player-reserve', 5)]),
      npc: createArmy([createCard('npc-reserve', 4)]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard: playerCard,
              defenderCard: npcCard,
            },
            winner: 'defender',
          },
        ],
      },
    })

    const { roundResult } = prepareRoundResult(finishedCombatState)

    expect(roundResult?.lostCards).toEqual([playerCard])
    expect(roundResult?.canRedoRound).toBe(true)

    const unavailable = prepareRoundResult({
      ...finishedCombatState,
      difficulty: 'expert',
      roundRedoAvailable: false,
    } as TestGameState)

    expect(unavailable.roundResult?.canRedoRound).toBe(false)
  })

  test('redoRoundResult resets the same round back to selection and consumes the one-time redo', () => {
    const playerDefender = createCard('player-defender', 3)
    const npcOriginal = createCard('npc-original', 7)
    const npcReplacement = createCard('npc-replacement', 2)
    const roundStartSnapshot: RoundSnapshot = {
      attackerSide: 'npc',
      player: createArmy([playerDefender]),
      npc: createArmy([npcOriginal, npcReplacement]),
    }
    const finishedCombatState = createState({
      attackerSide: 'npc',
      phase: 'combat',
      difficulty: 'easy',
      roundRedoAvailable: true,
      roundStartSnapshot,
      player: createArmy([]),
      npc: createArmy([npcReplacement]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard: npcOriginal,
              defenderCard: playerDefender,
            },
            winner: 'attacker',
          },
        ],
      },
    })

    const { roundResult } = prepareRoundResult(finishedCombatState)
    const redoneState = redoRoundResult(roundResult!)

    expect(redoneState.phase).toBe('selecting')
    expect(redoneState.attackerSide).toBe('npc')
    expect(redoneState.player).toEqual(roundStartSnapshot.player)
    expect(redoneState.npc).toEqual(roundStartSnapshot.npc)
    expect((redoneState as TestGameState).roundRedoAvailable).toBe(false)
    expect((redoneState as TestGameState).roundStartSnapshot).toBeNull()
  })

  test('prepareRoundResult uses the game difficulty when sending cards to rest', () => {
    const attackerCard = createCard('attacker', 8)
    const defenderCard = createCard('defender', 2)
    const finishedCombatState = createState({
      attackerSide: 'player',
      phase: 'combat',
      difficulty: 'expert',
      roundRedoAvailable: false,
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

  test('rejects stored game state with an invalid round snapshot payload', () => {
    const invalidRedoState = {
      ...createState({
        player: createArmy([createCard('p1', 4)]),
        npc: createArmy([createCard('n1', 6)]),
      }),
      roundStartSnapshot: {
        attackerSide: 'player',
        player: {
          available: [{ id: 'broken' }],
          resting: [],
        },
        npc: createArmy([createCard('n2', 3)]),
      },
    }

    expect(loadStoredGameState(JSON.stringify(invalidRedoState))).toBeNull()
  })
})
