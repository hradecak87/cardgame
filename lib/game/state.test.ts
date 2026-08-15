import { advanceCombat, beginRound, computeSlotCount, processRoundEnd, redoRound, startNewGame } from './state'
import type { Army, Card, Difficulty, GameState, Side } from './types'

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

describe('state', () => {
  test('computeSlotCount shrinks correctly for small armies', () => {
    expect(
      computeSlotCount(
        createState({
          player: createArmy([createCard('p1', 1)]),
          npc: createArmy([createCard('n1', 2)]),
        }),
      ),
    ).toBe(1)

    expect(
      computeSlotCount(
        createState({
          player: createArmy([createCard('p1', 1), createCard('p2', 2)]),
          npc: createArmy([createCard('n1', 2), createCard('n2', 3)]),
        }),
      ),
    ).toBe(2)
  })

  test('beginRound skips combat, ages resting cards, and keeps roles when a side has zero available cards', () => {
    const restingCard = createCard('resting', 4)
    const state = createState({
      attackerSide: 'npc',
      player: createArmy([], [{ card: restingCard, roundsRemaining: 1 }]),
      npc: createArmy([createCard('npc-available', 7)]),
    })

    const next = beginRound(state)

    expect(next.phase).toBe('selecting')
    expect(next.attackerSide).toBe('npc')
    expect(next.player.available.map((card) => card.id)).toEqual(['resting'])
    expect(next.player.resting).toEqual([])
    expect(next.combat).toBeNull()
  })

  test('game over is not triggered mid-combat and captured cards transfer ownership after round end', () => {
    const playerCard = createCard('player-low', 2)
    const npcCard = createCard('npc-high', 7)
    const state = createState({
      attackerSide: 'npc',
      player: createArmy([playerCard]),
      npc: createArmy([npcCard]),
    })

    const combatState = beginRound(state, [playerCard.id], () => 0)

    expect(combatState.phase).toBe('combat')
    expect(combatState.winner).toBeNull()
    expect(combatState.player.available).toEqual([])
    expect(combatState.npc.available).toEqual([])

    const resolvedCombat = advanceCombat(combatState, playerCard.id)
    const finishedState = processRoundEnd(resolvedCombat)

    expect(finishedState.phase).toBe('game-over')
    expect(finishedState.winner).toBe('npc')
    expect(finishedState.player.available).toEqual([])
    expect(finishedState.player.resting).toEqual([])
    expect(finishedState.npc.resting.map((entry) => entry.card.id).sort()).toEqual([
      'npc-high',
      'player-low',
    ])
  })

  test('beginRound snapshots both armies before combat starts on easy', () => {
    const playerAvailable = [createCard('player-1', 3), createCard('player-2', 6)]
    const npcAvailable = [createCard('npc-1', 7), createCard('npc-2', 2)]
    const playerResting = [{ card: createCard('player-rest', 4), roundsRemaining: 1 }]
    const npcResting = [{ card: createCard('npc-rest', 5), roundsRemaining: 2 }]
    const state = createState({
      attackerSide: 'npc',
      difficulty: 'easy',
      player: createArmy(playerAvailable, playerResting),
      npc: createArmy(npcAvailable, npcResting),
    })

    const next = beginRound(
      state,
      [playerAvailable[0].id, playerAvailable[1].id],
      () => 0.99,
    ) as TestGameState

    expect(next.roundStartSnapshot).toEqual({
      player: createArmy(playerAvailable, playerResting),
      npc: createArmy(npcAvailable, npcResting),
      attackerSide: 'npc',
    })
  })

  test('redoing a round restores the full pre-round snapshot, consumes the one use, and redraws the attacker line', () => {
    const originalAttacker = createCard('npc-original', 7)
    const replacementAttacker = createCard('npc-replacement', 2)
    const playerDefender = createCard('player-defender', 3)
    const preRoundSnapshot: RoundSnapshot = {
      attackerSide: 'npc',
      player: createArmy([playerDefender]),
      npc: createArmy([originalAttacker, replacementAttacker]),
    }
    const finishedRound = createState({
      attackerSide: 'npc',
      phase: 'combat',
      difficulty: 'easy',
      roundRedoAvailable: true,
      roundStartSnapshot: preRoundSnapshot,
      player: createArmy([]),
      npc: createArmy([replacementAttacker]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard: originalAttacker,
              defenderCard: playerDefender,
            },
            winner: 'attacker',
          },
        ],
      },
    })

    const redone = redoRound(finishedRound)

    expect(redone.phase).toBe('selecting')
    expect(redone.attackerSide).toBe('npc')
    expect(redone.player).toEqual(preRoundSnapshot.player)
    expect(redone.npc).toEqual(preRoundSnapshot.npc)
    expect(redone.roundRedoAvailable).toBe(false)
    expect(redone.roundStartSnapshot).toBeNull()
    expect(redone.combat).toBeNull()

    const replayed = beginRound(redone, [playerDefender.id], () => 0) as TestGameState

    expect(replayed.combat?.attackerQueue).toEqual([replacementAttacker])
  })

  test('round redo remains unavailable outside easy difficulty', () => {
    const playerAttacker = createCard('player-original', 2)
    const npcDefender = createCard('npc-defender', 7)
    const expertState = createState({
      attackerSide: 'player',
      phase: 'combat',
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
              attackerCard: playerAttacker,
              defenderCard: npcDefender,
            },
            winner: 'defender',
          },
        ],
      },
      difficulty: 'expert',
      roundRedoAvailable: false,
    })

    expect((expertState as TestGameState).roundRedoAvailable).toBe(false)
  })

  test.each<Difficulty>(['easy', 'normal', 'expert'])(
    'startNewGame stores %s difficulty and configures round redo availability',
    (difficulty) => {
    const state = startNewGame(difficulty, () => 0) as TestGameState
    const playerAces = state.player.available.filter((card) => card.rank === 'A').length
    const npcAces = state.npc.available.filter((card) => card.rank === 'A').length

    expect(state.difficulty).toBe(difficulty)
    expect(state.roundRedoAvailable).toBe(difficulty === 'easy')
    expect(state.roundStartSnapshot).toBeNull()
    expect(state.player.available.length).toBe(14 + playerAces)
    expect(state.npc.available.length).toBe(14 + npcAces)
    expect(
      [...state.player.available, ...state.npc.available].filter((card) => card.rank === 'A').length,
    ).toBe(4)
    },
  )
})
