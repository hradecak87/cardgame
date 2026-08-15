import { getAutoAdvanceAction, isValidGameStateShape, loadStoredGameState } from './useGameState'
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
})
