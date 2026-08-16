import { buildGameStateView } from './roomSync'
import type { PlayerHandRow, PublicState } from './types'
import type { Card } from '@/lib/game/types'

function card(id: string, power = 1): Card {
  return { id, rank: '7', suit: 'hearts', power }
}

function basePublicState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    roundNumber: 1,
    playerA: { availableCount: 16, resting: [] },
    playerB: { availableCount: 16, resting: [] },
    phase: 'selecting',
    combat: null,
    roundSummaryDismissedBy: { a: false, b: false },
    roundEndAppliedBy: { a: false, b: false },
    ...overrides,
  }
}

function baseHand(overrides: Partial<PlayerHandRow> = {}): PlayerHandRow {
  return {
    room_id: 'room-1',
    player_uid: 'uid-a',
    available: [card('7-hearts'), card('8-hearts')],
    resting: [],
    pending_attack_queue: null,
    pending_defender_pool: null,
    last_applied_round: 0,
    ...overrides,
  }
}

describe('buildGameStateView', () => {
  it('maps the calling slot to state.player and the other slot to state.npc', () => {
    const view = buildGameStateView(basePublicState(), 'a', baseHand())

    expect(view.player.available).toHaveLength(2)
    expect(view.npc.available).toHaveLength(16)
  })

  it('marks the caller as attacker/defender based on attacker_side vs its own slot', () => {
    const asAttacker = buildGameStateView(
      { ...basePublicState() },
      'a',
      baseHand(),
      'a',
    )
    const asDefender = buildGameStateView(
      { ...basePublicState() },
      'a',
      baseHand(),
      'b',
    )

    expect(asAttacker.attackerSide).toBe('player')
    expect(asDefender.attackerSide).toBe('npc')
  })

  it('reconstructs combat.attackerQueue from the private pending_attack_queue when the caller is attacker', () => {
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 2,
        attackerCardsRevealed: [],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [],
      },
    })
    const hand = baseHand({ pending_attack_queue: [card('9-hearts'), card('10-hearts')] })

    const view = buildGameStateView(publicState, 'a', hand, 'a')

    expect(view.combat?.attackerQueue).toEqual([card('9-hearts'), card('10-hearts')])
  })

  it('reconstructs combat.defenderPool from pending_defender_pool minus already-resolved cards', () => {
    const defenderCardUsed = card('J-hearts', 5)
    const defenderCardRemaining = card('Q-hearts', 6)
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 2,
        attackerCardsRevealed: [card('7-hearts')],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [
          { duel: { attackerCard: card('7-hearts'), defenderCard: defenderCardUsed }, winner: 'defender' },
        ],
      },
    })
    const hand = baseHand({ pending_defender_pool: [defenderCardUsed, defenderCardRemaining] })

    const view = buildGameStateView(publicState, 'b', hand, 'a')

    expect(view.combat?.defenderPool).toEqual([defenderCardRemaining])
  })

  it('gives the opponent placeholder available cards matching only the public count', () => {
    const view = buildGameStateView(basePublicState({ playerB: { availableCount: 5, resting: [] } }), 'a', baseHand())

    expect(view.npc.available).toHaveLength(5)
  })

  it('maps round-summary phase to combat for GameState purposes', () => {
    const view = buildGameStateView(basePublicState({ phase: 'round-summary' }), 'a', baseHand())

    expect(view.phase).toBe('combat')
  })

  it('excludes already-revealed cards from the attacker own-side attackerQueue', () => {
    const revealed = card('9-hearts')
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 2,
        attackerCardsRevealed: [revealed],
        revealedCard: card('10-hearts'),
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [],
      },
    })
    const hand = baseHand({ pending_attack_queue: [revealed, card('10-hearts')] })

    const view = buildGameStateView(publicState, 'a', hand, 'a')

    expect(view.combat?.attackerQueue).toEqual([])
  })

  it('gives the defender a count-only placeholder attackerQueue matching remaining slots', () => {
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 3,
        attackerCardsRevealed: [card('9-hearts')],
        revealedCard: null,
        defenderCommitted: true,
        pendingTies: [],
        resolvedDuels: [],
      },
    })

    const view = buildGameStateView(publicState, 'b', baseHand(), 'a')

    expect(view.combat?.attackerQueue).toHaveLength(2)
  })

  it("gives the attacker the defender's committed pool cards from the public state, minus already-used ones", () => {
    const defenderCardUsed = card('J-hearts', 5)
    const defenderCardRemaining = card('Q-hearts', 6)
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 3,
        attackerCardsRevealed: [card('7-hearts')],
        revealedCard: null,
        defenderCommitted: true,
        defenderPoolCards: [defenderCardUsed, defenderCardRemaining],
        pendingTies: [],
        resolvedDuels: [
          { duel: { attackerCard: card('7-hearts'), defenderCard: defenderCardUsed }, winner: 'defender' },
        ],
      },
    })

    const view = buildGameStateView(publicState, 'a', baseHand(), 'a')

    expect(view.combat?.defenderPool).toEqual([defenderCardRemaining])
  })

  it('gives the attacker an empty defenderPool before the defender has committed', () => {
    const publicState = basePublicState({
      phase: 'combat',
      combat: {
        attackerSlotsTotal: 3,
        attackerCardsRevealed: [card('7-hearts')],
        revealedCard: null,
        defenderCommitted: false,
        pendingTies: [],
        resolvedDuels: [],
      },
    })

    const view = buildGameStateView(publicState, 'a', baseHand(), 'a')

    expect(view.combat?.defenderPool).toEqual([])
  })
})

describe('writeWithVersionGuard', () => {
  const { writeWithVersionGuard } = require('./roomSync')

  it('succeeds when the update affects exactly one row', async () => {
    const update = jest.fn(async () => ({ affectedRows: 1 }))

    const result = await writeWithVersionGuard(update, 3)

    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith(3)
  })

  it('reports a version conflict when zero rows are affected', async () => {
    const update = jest.fn(async () => ({ affectedRows: 0 }))

    const result = await writeWithVersionGuard(update, 3)

    expect(result).toEqual({ ok: false, reason: 'version-conflict' })
  })

  it('propagates thrown errors as a network-error result', async () => {
    const update = jest.fn(async () => {
      throw new Error('boom')
    })

    const result = await writeWithVersionGuard(update, 3)

    expect(result).toEqual({ ok: false, reason: 'network-error', message: 'boom' })
  })
})
