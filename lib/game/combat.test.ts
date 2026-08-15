import {
  assignDefenderCard,
  finalizeCombat,
  isCombatFinished,
  revealNextAttacker,
} from './combat'
import type { Card, CombatState } from './types'

function createCard(id: string, power: number): Card {
  return {
    id,
    rank: '7',
    suit: 'hearts',
    power,
  }
}

function createCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    attackerQueue: [],
    revealedCard: null,
    defenderPool: [],
    pendingTies: [],
    resolvedDuels: [],
    ...overrides,
  }
}

describe('combat', () => {
  test('resolves a decisive duel immediately', () => {
    const attackerCard = createCard('attacker-8', 8)
    const defenderCard = createCard('defender-3', 3)
    const combat = createCombatState({
      revealedCard: attackerCard,
      defenderPool: [defenderCard],
    })

    const next = assignDefenderCard(combat, defenderCard.id)

    expect(next.revealedCard).toBeNull()
    expect(next.pendingTies).toEqual([])
    expect(next.defenderPool).toEqual([])
    expect(next.resolvedDuels).toEqual([
      {
        duel: { attackerCard, defenderCard },
        winner: 'attacker',
      },
    ])
  })

  test('a single tie is resolved by the next decisive duel', () => {
    const firstAttacker = createCard('attacker-5a', 5)
    const tiedDefender = createCard('defender-5', 5)
    const secondAttacker = createCard('attacker-8', 8)
    const losingDefender = createCard('defender-1', 1)
    const combat = createCombatState({
      attackerQueue: [secondAttacker],
      revealedCard: firstAttacker,
      defenderPool: [tiedDefender, losingDefender],
    })

    const tied = assignDefenderCard(combat, tiedDefender.id)
    const revealed = revealNextAttacker(tied)
    const resolved = assignDefenderCard(revealed, losingDefender.id)

    expect(resolved.pendingTies).toEqual([])
    expect(resolved.resolvedDuels).toEqual([
      {
        duel: { attackerCard: firstAttacker, defenderCard: tiedDefender },
        winner: 'attacker',
      },
      {
        duel: { attackerCard: secondAttacker, defenderCard: losingDefender },
        winner: 'attacker',
      },
    ])
  })

  test('multiple chained ties are resolved together by the next decisive duel', () => {
    const firstAttacker = createCard('attacker-4', 4)
    const secondAttacker = createCard('attacker-6', 6)
    const thirdAttacker = createCard('attacker-2', 2)
    const firstTie = createCard('defender-4', 4)
    const secondTie = createCard('defender-6', 6)
    const decisiveDefender = createCard('defender-3', 3)
    const combat = createCombatState({
      attackerQueue: [secondAttacker, thirdAttacker],
      revealedCard: firstAttacker,
      defenderPool: [firstTie, secondTie, decisiveDefender],
    })

    const afterFirstTie = assignDefenderCard(combat, firstTie.id)
    const afterSecondReveal = revealNextAttacker(afterFirstTie)
    const afterSecondTie = assignDefenderCard(afterSecondReveal, secondTie.id)
    const afterThirdReveal = revealNextAttacker(afterSecondTie)
    const resolved = assignDefenderCard(afterThirdReveal, decisiveDefender.id)

    expect(resolved.pendingTies).toEqual([])
    expect(resolved.resolvedDuels).toEqual([
      {
        duel: { attackerCard: firstAttacker, defenderCard: firstTie },
        winner: 'defender',
      },
      {
        duel: { attackerCard: secondAttacker, defenderCard: secondTie },
        winner: 'defender',
      },
      {
        duel: { attackerCard: thirdAttacker, defenderCard: decisiveDefender },
        winner: 'defender',
      },
    ])
  })

  test('an unresolved final tie defaults to defender win when combat is finalized', () => {
    const attackerCard = createCard('attacker-4', 4)
    const defenderCard = createCard('defender-4', 4)
    const combat = createCombatState({
      revealedCard: attackerCard,
      defenderPool: [defenderCard],
    })

    const tied = assignDefenderCard(combat, defenderCard.id)

    expect(isCombatFinished(tied)).toBe(true)

    const finalized = finalizeCombat(tied)

    expect(finalized.pendingTies).toEqual([])
    expect(finalized.resolvedDuels).toEqual([
      {
        duel: { attackerCard, defenderCard },
        winner: 'defender',
      },
    ])
  })
})
