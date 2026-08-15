import { advanceCombat, beginRound, computeSlotCount, processRoundEnd } from './state'
import type { Army, Card, GameState } from './types'

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
})
