import { buildRoundResultCards } from './roundResult'
import type { GameState } from './types'
import type { Card } from './types'

function card(id: string, power = 1): Card {
  return { id, rank: '7', suit: 'hearts', power }
}

function baseGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    player: { available: [], resting: [] },
    npc: { available: [], resting: [] },
    difficulty: 'normal',
    roundRedoAvailable: false,
    roundStartSnapshot: null,
    attackerSide: 'player',
    phase: 'combat',
    combat: null,
    winner: null,
    ...overrides,
  }
}

describe('buildRoundResultCards', () => {
  it('returns empty arrays when there is no combat state', () => {
    const state = baseGameState({ combat: null })

    const result = buildRoundResultCards(state)

    expect(result.capturedCards).toEqual([])
    expect(result.lostCards).toEqual([])
  })

  it('returns captured attacker cards when attacker wins', () => {
    const defenderCard = card('D1')
    const attackerCard = card('A1')
    const state = baseGameState({
      attackerSide: 'player',
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [{ duel: { attackerCard, defenderCard }, winner: 'attacker' }],
      },
    })

    const result = buildRoundResultCards(state)

    expect(result.capturedCards).toEqual([defenderCard])
    expect(result.lostCards).toEqual([])
  })

  it('returns lost attacker cards when defender wins', () => {
    const defenderCard = card('D1')
    const attackerCard = card('A1')
    const state = baseGameState({
      attackerSide: 'player',
      combat: {
        attackerQueue: [],
        revealedCard: null,
        defenderPool: [],
        pendingTies: [],
        resolvedDuels: [{ duel: { attackerCard, defenderCard }, winner: 'defender' }],
      },
    })

    const result = buildRoundResultCards(state)

    expect(result.capturedCards).toEqual([])
    expect(result.lostCards).toEqual([attackerCard])
  })
})
