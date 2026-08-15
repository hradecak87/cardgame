import { dismissRoundResult, getAutoAdvanceAction, isValidGameStateShape, loadStoredGameState, prepareRoundResult } from './useGameState'
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
})
