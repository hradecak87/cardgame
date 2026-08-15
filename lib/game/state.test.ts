import { advanceCombat, beginRound, computeSlotCount, finalizeCombatState, forfeitPendingDuelRedo, processRoundEnd, redoPendingDuel, startNewGame } from './state'
import type { Army, Card, Difficulty, GameState } from './types'

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

  test('easy offers a single redo after the player loses as defender and lets the player reselect a defense', () => {
    const originalAttacker = createCard('npc-original', 7)
    const replacementAttacker = createCard('npc-replacement', 2)
    const originalDefender = createCard('player-original', 3)
    const alternateDefender = createCard('player-alternate', 8)
    const state = createState({
      attackerSide: 'npc',
      phase: 'combat',
      player: createArmy([]),
      npc: createArmy([replacementAttacker]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [alternateDefender],
        pendingTies: [],
        resolvedDuels: [
          {
            duel: {
              attackerCard: originalAttacker,
              defenderCard: originalDefender,
            },
            winner: 'attacker',
          },
        ],
      },
      pendingDuelRedo: {
        duel: {
          duel: {
            attackerCard: originalAttacker,
            defenderCard: originalDefender,
          },
          winner: 'attacker',
        },
      },
    })

    const redone = redoPendingDuel(state, () => 0)

    expect(redone.duelRedosRemaining).toBe(0)
    expect(redone.pendingDuelRedo).toBeNull()
    expect(redone.npc.available.map((card) => card.id).sort()).toEqual([
      originalAttacker.id,
    ])
    expect(redone.combat?.revealedCard).toEqual(replacementAttacker)
    expect(redone.combat?.defenderPool.map((card) => card.id).sort()).toEqual([
      alternateDefender.id,
      originalDefender.id,
    ])
    expect(redone.combat?.resolvedDuels).toEqual([])

    const resolved = advanceCombat(redone, alternateDefender.id)

    expect(resolved.combat?.resolvedDuels).toEqual([
      {
        duel: {
          attackerCard: replacementAttacker,
          defenderCard: alternateDefender,
        },
        winner: 'defender',
      },
    ])
  })

  test('redo can auto-resolve against the npc defender and is only offered on easy once', () => {
    const playerAttacker = createCard('player-original', 2)
    const replacementAttacker = createCard('player-replacement', 8)
    const npcDefender = createCard('npc-defender', 7)
    const npcReserve = createCard('npc-reserve', 1)
    const baseCombatState = {
      attackerQueue: [],
      revealedCard: playerAttacker,
      defenderPool: [npcDefender],
      pendingTies: [],
      resolvedDuels: [],
    }

    const easyState = createState({
      attackerSide: 'player',
      phase: 'combat',
      player: createArmy([replacementAttacker]),
      npc: createArmy([npcReserve]),
      combat: baseCombatState,
      difficulty: 'easy',
      duelRedosRemaining: 1,
    })

    const afterLoss = advanceCombat(easyState)

    expect(afterLoss.pendingDuelRedo?.duel).toEqual({
      duel: {
        attackerCard: playerAttacker,
        defenderCard: npcDefender,
      },
      winner: 'defender',
    })

    const redone = redoPendingDuel(afterLoss, () => 0)

    expect(redone.pendingDuelRedo).toBeNull()
    expect(redone.duelRedosRemaining).toBe(0)
    expect(redone.player.available.map((card) => card.id).sort()).toEqual([playerAttacker.id])
    expect(redone.combat?.resolvedDuels).toEqual([
      {
        duel: {
          attackerCard: replacementAttacker,
          defenderCard: npcDefender,
        },
        winner: 'attacker',
      },
    ])

    const declined = forfeitPendingDuelRedo(afterLoss)

    expect(declined.pendingDuelRedo).toBeNull()
    expect(declined.duelRedosRemaining).toBe(0)

    const expertState = createState({
      ...easyState,
      difficulty: 'expert',
      duelRedosRemaining: 0,
    })

    expect(advanceCombat(expertState).pendingDuelRedo).toBeNull()
  })

  test('finalizing a tied combat can also create the easy redo prompt', () => {
    const playerAttacker = createCard('player-original', 5)
    const replacementAttacker = createCard('player-replacement', 8)
    const npcDefender = createCard('npc-defender', 5)
    const state = createState({
      attackerSide: 'player',
      phase: 'combat',
      player: createArmy([replacementAttacker]),
      npc: createArmy([]),
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [
          {
            attackerCard: playerAttacker,
            defenderCard: npcDefender,
          },
        ],
        resolvedDuels: [],
      },
    })

    const finalized = finalizeCombatState(state)

    expect(finalized.combat?.resolvedDuels).toEqual([
      {
        duel: {
          attackerCard: playerAttacker,
          defenderCard: npcDefender,
        },
        winner: 'defender',
      },
    ])
    expect(finalized.pendingDuelRedo?.duel.duel.attackerCard.id).toBe(playerAttacker.id)
  })

  test.each<Difficulty>(['easy', 'normal', 'expert'])(
    'startNewGame stores %s difficulty and configures redo availability',
    (difficulty) => {
    const state = startNewGame(difficulty, () => 0)
    const playerAces = state.player.available.filter((card) => card.rank === 'A').length
    const npcAces = state.npc.available.filter((card) => card.rank === 'A').length

    expect(state.difficulty).toBe(difficulty)
    expect(state.duelRedosRemaining).toBe(difficulty === 'easy' ? 1 : 0)
    expect(state.pendingDuelRedo).toBeNull()
    expect(state.player.available.length).toBe(14 + playerAces)
    expect(state.npc.available.length).toBe(14 + npcAces)
    expect(
      [...state.player.available, ...state.npc.available].filter((card) => card.rank === 'A').length,
    ).toBe(4)
    },
  )
})
