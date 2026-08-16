/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import type { Card } from '@/lib/game/types'
import type { PlayerHandRow, PublicState, RoomRow } from '@/lib/multiplayer/types'
import { writeWithVersionGuard } from '@/lib/multiplayer/roomSync'
import { ensureAnonymousSession, getSupabaseClient } from '@/lib/multiplayer/supabaseClient'
import { loadStoredRoomCode, ROOM_CODE_STORAGE_KEY, useMultiplayerGameState } from './useMultiplayerGameState'

jest.mock('@/lib/multiplayer/supabaseClient', () => ({
  ensureAnonymousSession: jest.fn(),
  getSupabaseClient: jest.fn(),
}))

jest.mock('@/lib/multiplayer/roomSync', () => {
  const actual = jest.requireActual('@/lib/multiplayer/roomSync')

  return {
    ...actual,
    writeWithVersionGuard: jest.fn(),
  }
})

type MockQuery = {
  select: jest.Mock
  update: jest.Mock
  eq: jest.Mock
  maybeSingle: jest.Mock
}

type MockSupabaseClient = {
  from: jest.Mock
  channel: jest.Mock
  rpc: jest.Mock
}

type MockChannel = {
  on: jest.Mock
  subscribe: jest.Mock
  presenceState: jest.Mock
  track: jest.Mock
  unsubscribe: jest.Mock
}

const mockedEnsureAnonymousSession = jest.mocked(ensureAnonymousSession)
const mockedGetSupabaseClient = jest.mocked(getSupabaseClient)
const mockedWriteWithVersionGuard = jest.mocked(writeWithVersionGuard)

function createCard(id: string, power: number): Card {
  return {
    id,
    rank: '7',
    suit: 'hearts',
    power,
  }
}

function createPublicState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    roundNumber: 1,
    playerA: { availableCount: 3, resting: [] },
    playerB: { availableCount: 3, resting: [] },
    phase: 'combat',
    combat: {
      attackerSlotsTotal: 3,
      attackerCardsRevealed: [],
      revealedCard: null,
      defenderCommitted: true,
      pendingTies: [],
      resolvedDuels: [],
    },
    roundSummaryDismissedBy: { a: false, b: false },
    roundEndAppliedBy: { a: false, b: false },
    ...overrides,
  }
}

function createRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
  return {
    id: 'room-1',
    code: '12345',
    version: 7,
    status: 'playing',
    player_a_nickname: 'Attacker',
    player_b_nickname: 'Defender',
    player_a_uid: 'uid-a',
    player_b_uid: 'uid-b',
    attacker_side: 'a',
    public_state: createPublicState(),
    winner: null,
    ...overrides,
  }
}

function createHandRow(overrides: Partial<PlayerHandRow> = {}): PlayerHandRow {
  return {
    room_id: 'room-1',
    player_uid: 'uid-a',
    available: [],
    resting: [],
    pending_attack_queue: null,
    pending_defender_pool: null,
    last_applied_round: 0,
    ...overrides,
  }
}

function createMockSupabase(roomData: RoomRow, handData: PlayerHandRow): {
  client: MockSupabaseClient
  roomUpdates: Array<Record<string, unknown>>
  emitRoomChange: (nextRoom: RoomRow & { abandoned_by?: string | null }) => void
  channel: MockChannel
} {
  const roomUpdates: Array<Record<string, unknown>> = []
  let roomChangeHandler: ((payload: { new: RoomRow & { abandoned_by?: string | null } }) => void) | null = null

  const roomSelectQuery: Partial<MockQuery> = {
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: roomData, error: null }),
  }
  roomSelectQuery.eq!.mockReturnValue(roomSelectQuery)

  const playerHandSelectQuery: Partial<MockQuery> = {
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: handData, error: null }),
  }
  playerHandSelectQuery.eq!.mockReturnValue(playerHandSelectQuery)

  const roomUpdateQuery: Partial<MockQuery> = {
    eq: jest.fn(),
  }
  roomUpdateQuery.eq!.mockReturnValue(roomUpdateQuery)
  Object.assign(roomUpdateQuery, { status: 204 })

  const playerHandUpdateQuery: Partial<MockQuery> = {
    eq: jest.fn(),
  }
  playerHandUpdateQuery.eq!.mockReturnValue(playerHandUpdateQuery)
  Object.assign(playerHandUpdateQuery, { status: 204 })

  const roomsTable = {
    select: jest.fn().mockReturnValue(roomSelectQuery),
    update: jest.fn((payload: Record<string, unknown>) => {
      roomUpdates.push(payload)
      return roomUpdateQuery
    }),
  }

  const playerHandsTable = {
    select: jest.fn().mockReturnValue(playerHandSelectQuery),
    update: jest.fn(() => playerHandUpdateQuery),
  }

  const channel = {} as MockChannel
  channel.on = jest.fn().mockImplementation((event: string, _config: unknown, callback: (...args: any[]) => void) => {
    if (event === 'postgres_changes') {
      roomChangeHandler = callback as typeof roomChangeHandler
    }

    return channel
  })
  channel.subscribe = jest.fn((callback: (status: string) => void) => {
    queueMicrotask(() => callback('SUBSCRIBED'))
    return channel
  })
  channel.presenceState = jest.fn(() => ({}))
  channel.track = jest.fn()
  channel.unsubscribe = jest.fn()

  const client: MockSupabaseClient = {
    from: jest.fn((table: string) => {
      if (table === 'rooms') {
        return roomsTable
      }

      if (table === 'player_hands') {
        return playerHandsTable
      }

      throw new Error(`Unexpected table ${table}`)
    }),
    channel: jest.fn(() => channel),
    rpc: jest.fn(),
  }

  return {
    client,
    roomUpdates,
    emitRoomChange: (nextRoom) => {
      roomChangeHandler?.({ new: nextRoom })
    },
    channel,
  }
}

async function mountHookWithRoom(roomData: RoomRow, handData: PlayerHandRow) {
  const { client, roomUpdates, emitRoomChange, channel } = createMockSupabase(roomData, handData)

  mockedEnsureAnonymousSession.mockResolvedValue(handData.player_uid)
  mockedGetSupabaseClient.mockReturnValue(client as never)
  mockedWriteWithVersionGuard.mockImplementation(async (update, expectedVersion) => {
    await update(expectedVersion)
    return { ok: true }
  })

  window.localStorage.setItem(ROOM_CODE_STORAGE_KEY, roomData.code)

  const hook = renderHook(() => useMultiplayerGameState())

  await waitFor(() => {
    expect(hook.result.current.roomCode).toBe(roomData.code)
    expect(hook.result.current.roomStatus).not.toBeNull()
  })

  return { ...hook, roomUpdates, emitRoomChange, channel }
}

describe('loadStoredRoomCode', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredRoomCode(null)).toBeNull()
  })

  it('returns the stored code when it looks like a valid 5-digit code', () => {
    expect(loadStoredRoomCode('04213')).toBe('04213')
  })

  it('rejects malformed stored values', () => {
    expect(loadStoredRoomCode('not-a-code')).toBeNull()
    expect(loadStoredRoomCode('123')).toBeNull()
  })
})

describe('ROOM_CODE_STORAGE_KEY', () => {
  it('is a stable, namespaced key', () => {
    expect(ROOM_CODE_STORAGE_KEY).toBe('battle-card-game-multiplayer-room-code')
  })
})

describe('useMultiplayerGameState combat reveals', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('automatically reveals the next attacker card for the attacker without a manual click', async () => {
    const firstAttacker = createCard('attacker-1', 8)
    const secondAttacker = createCard('attacker-2', 5)
    const roomData = createRoomRow()
    const handData = createHandRow({
      player_uid: 'uid-a',
      pending_attack_queue: [firstAttacker, secondAttacker],
    })

    const { roomUpdates } = await mountHookWithRoom(roomData, handData)

    await act(async () => {
      jest.advanceTimersByTime(850)
      await Promise.resolve()
    })

    expect(roomUpdates).toHaveLength(1)
    expect(roomUpdates[0]).toMatchObject({
      version: roomData.version + 1,
      public_state: {
        combat: {
          attackerCardsRevealed: [firstAttacker],
          revealedCard: firstAttacker,
        },
      },
    })
  })

  it('caps attackerSlotsTotal at the defender\'s available (non-resting) card count, not available+resting', async () => {
    // Regression test: attackerSlotsTotal was computed as
    // min(attackerDrawCount, defenderAvailableCount + defenderRestingCount),
    // but defender.available.length (not available+resting) is what the
    // defender can actually select from (mirrors single-player's
    // computeSlotCount, which only counts `available`). Once a few rounds
    // pass and captured troops start resting, defenderAvailableCount can
    // drop below 3 while resting count keeps the incorrect total >= 3. The
    // attacker would then draw/reveal 3 cards while the defender could only
    // commit 2, permanently desyncing attackerCardsRevealed.length from
    // attackerSlotsTotal and softlocking the round (no round-summary popup).
    const roomData = createRoomRow({
      attacker_side: 'a',
      public_state: createPublicState({
        phase: 'selecting',
        combat: null,
        playerB: {
          availableCount: 2,
          resting: [
            { card: createCard('resting-1', 9), roundsRemaining: 1 },
            { card: createCard('resting-2', 7), roundsRemaining: 2 },
          ],
        },
      }),
    })
    const handData = createHandRow({
      player_uid: 'uid-a',
      available: [createCard('a-1', 4), createCard('a-2', 5), createCard('a-3', 6), createCard('a-4', 8)],
      pending_attack_queue: null,
    })

    const { roomUpdates } = await mountHookWithRoom(roomData, handData)

    await waitFor(() => {
      expect(roomUpdates.length).toBeGreaterThan(0)
    })

    const combatUpdate = roomUpdates.find(
      (update) => (update.public_state as PublicState)?.combat !== undefined,
    )

    expect((combatUpdate?.public_state as PublicState)?.combat?.attackerSlotsTotal).toBe(2)
  })

  it('uses only the already-drawn attack queue size (not remaining available + queue) when republishing combat after a reconnect race', async () => {
    // Regression test: when the attacker already drew their 3 cards into
    // pending_attack_queue on a previous pass, but the initial combat
    // state was never successfully published (e.g. a remount/reconnect
    // race), this "already drew" fallback republishes it. It mistakenly
    // capped attackerSlotsTotal at
    // `available.length + pending_attack_queue.length` (the attacker's
    // *entire remaining army*) instead of just
    // `pending_attack_queue.length` (the cards actually queued for this
    // round's combat). With a large army, this produced e.g.
    // attackerSlotsTotal: 10 while only 3 cards would ever be revealed -
    // a permanent mismatch that could never resolve (no round-summary
    // popup, unfixable even by a page refresh, since it was already
    // published to the DB).
    const drawnCards = [createCard('attacker-1', 4), createCard('attacker-2', 5), createCard('attacker-3', 6)]
    const roomData = createRoomRow({
      attacker_side: 'a',
      public_state: createPublicState({
        phase: 'selecting',
        combat: null,
        playerB: { availableCount: 10, resting: [] },
      }),
    })
    const handData = createHandRow({
      player_uid: 'uid-a',
      available: [createCard('a-4', 3), createCard('a-5', 3), createCard('a-6', 3), createCard('a-7', 3)],
      pending_attack_queue: drawnCards,
    })

    const { roomUpdates } = await mountHookWithRoom(roomData, handData)

    await waitFor(() => {
      expect(roomUpdates.length).toBeGreaterThan(0)
    })

    const combatUpdate = roomUpdates.find((update) => (update.public_state as PublicState)?.combat !== undefined)

    expect((combatUpdate?.public_state as PublicState)?.combat?.attackerSlotsTotal).toBe(3)
  })

  describe('useMultiplayerGameState round-summary reconciliation', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.clearAllMocks()
      window.localStorage.clear()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('publishes own round completion immediately after both players dismiss the round summary', async () => {
      const roomData = createRoomRow({
        public_state: createPublicState({
          phase: 'round-summary',
          roundSummaryDismissedBy: { a: true, b: true },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
        last_applied_round: 0,
      })

      const { roomUpdates } = await mountHookWithRoom(roomData, handData)

      await waitFor(() => {
        expect(roomUpdates).toHaveLength(1)
      })

      expect(roomUpdates[0]).toMatchObject({
        version: roomData.version + 1,
        public_state: {
          roundEndAppliedBy: { a: true, b: false },
          playerA: {
            availableCount: 0,
            resting: [],
          },
        },
      })
    })

    it('does not let a stale in-flight reconcile pass clobber fresher state that arrived from Realtime while its write was pending', async () => {
      // Regression test for BUG FIX #7: the reconciliation effect's cleanup
      // set `cancelled = true` on every re-run, but reconcile() never
      // actually checked it before calling updateRoom() on a successful
      // write. If this client's own write (e.g. Stage B's round-completion
      // publish) was slow, and a fresher update from the OTHER player
      // arrived via Realtime in the meantime (advancing room.version and
      // publicState further), the stale call would still resolve and
      // clobber the newer local state with its own now-outdated computed
      // values once its await finally settled - discarding the opponent's
      // progress and potentially permanently softlocking the round
      // transition (the DB itself could end up inconsistent with what any
      // client believed, in a way not fixed by a page refresh once other
      // writes started failing their version guard against the clobbered
      // version).
      const roomData = createRoomRow({
        public_state: createPublicState({
          phase: 'round-summary',
          roundSummaryDismissedBy: { a: true, b: true },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
        last_applied_round: 1, // Stage A already applied; only Stage B should fire
      })

      let releaseFirstWrite: (() => void) | null = null
      const firstWriteGate = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve
      })
      let writeCallCount = 0

      const { client, roomUpdates, emitRoomChange } = createMockSupabase(roomData, handData)
      mockedEnsureAnonymousSession.mockResolvedValue(handData.player_uid)
      mockedGetSupabaseClient.mockReturnValue(client as never)
      mockedWriteWithVersionGuard.mockImplementation(async (update, expectedVersion) => {
        writeCallCount += 1
        if (writeCallCount === 1) {
          await firstWriteGate
        }
        await update(expectedVersion)
        return { ok: true }
      })

      window.localStorage.setItem(ROOM_CODE_STORAGE_KEY, roomData.code)

      const hook = renderHook(() => useMultiplayerGameState())

      await waitFor(() => {
        expect(hook.result.current.roomCode).toBe(roomData.code)
      })

      await waitFor(() => {
        expect(writeCallCount).toBeGreaterThanOrEqual(1)
      })

      // While our own Stage B write is still pending, simulate the OTHER
      // player's shared-conclusion write already landing via Realtime -
      // advancing further than our own in-flight write's stale closure
      // knows about.
      const fresherPublicState = createPublicState({
        phase: 'selecting',
        roundNumber: 2,
        roundSummaryDismissedBy: { a: false, b: false },
        roundEndAppliedBy: { a: false, b: false },
        combat: null,
      })
      const fresherRoomData = createRoomRow({
        version: roomData.version + 5,
        attacker_side: 'b',
        public_state: fresherPublicState,
      })

      await act(async () => {
        emitRoomChange(fresherRoomData)
      })

      await waitFor(() => {
        expect(hook.result.current.publicPhase).toBe('selecting')
      })

      // Now let the stale Stage B write finally resolve.
      await act(async () => {
        releaseFirstWrite?.()
        await Promise.resolve()
        await Promise.resolve()
      })

      // The stale pass must not have clobbered the fresher externally
      // arrived state back to 'round-summary'.
      expect(hook.result.current.publicPhase).toBe('selecting')
      expect(roomUpdates.length).toBeGreaterThanOrEqual(1)
    })

    it('sends both the winner\'s own fighting card and the captured enemy card to rest, not just the captured card', async () => {
      // Regression test: per game rules ("hráč si všechny vyhrané vojáky
      // včetně svých po boji dá do odpočívárny" - the winner rests ALL
      // winning soldiers, including their own), a winning duel should send
      // BOTH the winner's own card and the captured enemy card to that
      // player's rest area for 2 rounds - matching single-player's
      // processRoundEnd (attackerWonCards/defenderWonCards include both
      // duel.attackerCard and duel.defenderCard). The multiplayer
      // reconciliation only ever rested the *captured* card, silently
      // dropping the winner's own fighting card entirely (it was already
      // removed from `available` when queued for combat, and never added
      // back to either `available` or `resting`) - shrinking both
      // players' troop counts every round beyond fair losses and
      // eventually running the whole army out of cards.
      const ownWinningCard = createCard('attacker-1', 8)
      const capturedCard = createCard('defender-1', 3)
      const roomData = createRoomRow({
        attacker_side: 'a',
        public_state: createPublicState({
          phase: 'round-summary',
          roundSummaryDismissedBy: { a: true, b: true },
          combat: {
            attackerSlotsTotal: 1,
            attackerCardsRevealed: [ownWinningCard],
            revealedCard: null,
            defenderCommitted: true,
            pendingTies: [],
            resolvedDuels: [{ duel: { attackerCard: ownWinningCard, defenderCard: capturedCard }, winner: 'attacker' }],
          },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
        available: [],
        pending_attack_queue: [ownWinningCard],
        last_applied_round: 0,
      })

      const { roomUpdates } = await mountHookWithRoom(roomData, handData)

      await waitFor(() => {
        expect(roomUpdates.length).toBeGreaterThan(0)
      })

      const restingIds = (roomUpdates[0]?.public_state as PublicState)?.playerA.resting.map((entry) => entry.card.id)

      expect(restingIds).toEqual(expect.arrayContaining(['attacker-1', 'defender-1']))
      expect(restingIds).toHaveLength(2)
    })

    it('returns unfought queued attacker cards to available at round end instead of discarding them', async () => {
      // Regression test: the attacker always draws up to 3 cards into
      // pending_attack_queue, but attackerSlotsTotal (how many duels
      // actually happen) is capped at the defender's available card
      // count and can be lower - e.g. 1, when the opponent is down to
      // their last card. The round-end reconciliation (Stage A) cleared
      // pending_attack_queue to null without folding any queued-but-
      // never-revealed cards back into `available`, silently deleting
      // them from the attacker's army every time this edge case
      // occurred.
      const foughtCard = createCard('attacker-1', 8)
      const unfoughtCard = createCard('attacker-2', 5)
      const capturedCard = createCard('defender-1', 3)
      const roomData = createRoomRow({
        attacker_side: 'a',
        public_state: createPublicState({
          phase: 'round-summary',
          roundSummaryDismissedBy: { a: true, b: true },
          combat: {
            attackerSlotsTotal: 1,
            attackerCardsRevealed: [foughtCard],
            revealedCard: null,
            defenderCommitted: true,
            pendingTies: [],
            resolvedDuels: [{ duel: { attackerCard: foughtCard, defenderCard: capturedCard }, winner: 'attacker' }],
          },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
        available: [],
        pending_attack_queue: [foughtCard, unfoughtCard],
        last_applied_round: 0,
      })

      const { result } = await mountHookWithRoom(roomData, handData)

      await waitFor(() => {
        expect(result.current.state?.player.available.map((card) => card.id)).toContain('attacker-2')
      })

      expect(result.current.state?.player.available).toHaveLength(1)
      expect(result.current.state?.player.available[0].id).toBe('attacker-2')
    })

    it('lets the current attacker publish the shared conclusion in the same pass when becoming the second finisher', async () => {
      const roomData = createRoomRow({
        attacker_side: 'a',
        public_state: createPublicState({
          phase: 'round-summary',
          roundSummaryDismissedBy: { a: true, b: true },
          roundEndAppliedBy: { a: false, b: true },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
        available: [createCard('survivor-a', 4)],
        last_applied_round: 1,
      })

      const { roomUpdates } = await mountHookWithRoom(roomData, handData)

      await waitFor(() => {
        expect(roomUpdates).toHaveLength(2)
      })

      expect(roomUpdates[0]).toMatchObject({
        version: roomData.version + 1,
        public_state: {
          roundEndAppliedBy: { a: true, b: true },
        },
      })

      expect(roomUpdates[1]).toMatchObject({
        version: roomData.version + 2,
        public_state: {
          roundNumber: 2,
          phase: 'selecting',
          combat: null,
          roundSummaryDismissedBy: { a: false, b: false },
          roundEndAppliedBy: { a: false, b: false },
        },
        attacker_side: 'b',
        status: 'playing',
        winner: null,
      })
    })

    it('does not let the non-attacker publish the shared conclusion redundantly', async () => {
      const roomData = createRoomRow({
        attacker_side: 'b',
        public_state: createPublicState({
          phase: 'round-summary',
          roundSummaryDismissedBy: { a: true, b: true },
          roundEndAppliedBy: { a: true, b: true },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
        last_applied_round: 1,
      })

      const { roomUpdates } = await mountHookWithRoom(roomData, handData)

      await act(async () => {
        await Promise.resolve()
      })

      expect(roomUpdates).toHaveLength(0)
    })

    it('transitions to round-summary once all duels are resolved, even when the defender is slot a (attacker is b)', async () => {
      // Regression test: this logic previously hardcoded `ownSlot === 'b'`
      // as "the defender", but deal_room() picks the attacker randomly
      // ('a' or 'b') each round, so whenever attacker_side happened to be
      // 'b' the real defender (slot 'a') never drove this transition and
      // the round-summary popup never appeared, softlocking the game.
      const attackerCard = createCard('attacker-1', 8)
      const defenderCard = createCard('defender-1', 3)
      const roomData = createRoomRow({
        player_a_uid: 'uid-a',
        player_b_uid: 'uid-b',
        attacker_side: 'b',
        public_state: createPublicState({
          phase: 'combat',
          combat: {
            attackerSlotsTotal: 1,
            attackerCardsRevealed: [attackerCard],
            revealedCard: null,
            defenderCommitted: true,
            pendingTies: [],
            resolvedDuels: [{ duel: { attackerCard, defenderCard }, winner: 'attacker' }],
          },
        }),
      })
      const handData = createHandRow({
        player_uid: 'uid-a',
      })

      const { roomUpdates } = await mountHookWithRoom(roomData, handData)

      await act(async () => {
        await Promise.resolve()
      })

      expect(roomUpdates.some((update) => (update.public_state as PublicState)?.phase === 'round-summary')).toBe(true)
    })
  })

  it('does not auto-reveal a new attacker card while the previous duel is still unresolved', async () => {
    const alreadyRevealed = createCard('attacker-1', 8)
    const nextAttacker = createCard('attacker-2', 5)
    const roomData = createRoomRow({
      public_state: createPublicState({
        combat: {
          attackerSlotsTotal: 3,
          attackerCardsRevealed: [alreadyRevealed],
          revealedCard: alreadyRevealed,
          defenderCommitted: true,
          pendingTies: [],
          resolvedDuels: [],
        },
      }),
    })
    const handData = createHandRow({
      player_uid: 'uid-a',
      pending_attack_queue: [alreadyRevealed, nextAttacker],
    })

    const { roomUpdates } = await mountHookWithRoom(roomData, handData)

    await act(async () => {
      jest.advanceTimersByTime(850)
      await Promise.resolve()
    })

    expect(roomUpdates).toHaveLength(0)
  })

  it('does not auto-reveal a new attacker card once attackerCardsRevealed already reaches attackerSlotsTotal, even if unrevealed queue cards remain', async () => {
    // Regression test: the attacker always draws up to 3 cards into
    // pending_attack_queue, but attackerSlotsTotal (how many duels will
    // actually happen this round) is capped at the defender's available
    // card count and can be lower - e.g. 1, when the opponent is down to
    // their last card. revealNextAttacker only checked that the previous
    // duel was resolved (revealedCard === null) and that unrevealed cards
    // remained in the *queue*, never that attackerCardsRevealed.length was
    // still below attackerSlotsTotal. So once the single allowed duel
    // resolved, it kept revealing further queued cards anyway, pushing
    // attackerCardsRevealed past attackerSlotsTotal - permanently breaking
    // the round-summary transition guard AND leaving the defender facing
    // a revealed card with no defenderPoolCards entry left to answer it
    // with (the pool was only ever sized to attackerSlotsTotal).
    const firstAttacker = createCard('attacker-1', 8)
    const secondAttacker = createCard('attacker-2', 5)
    const roomData = createRoomRow({
      public_state: createPublicState({
        combat: {
          attackerSlotsTotal: 1,
          attackerCardsRevealed: [firstAttacker],
          revealedCard: null,
          defenderCommitted: true,
          pendingTies: [],
          resolvedDuels: [{ duel: { attackerCard: firstAttacker, defenderCard: createCard('defender-1', 3) }, winner: 'defender' }],
        },
      }),
    })
    const handData = createHandRow({
      player_uid: 'uid-a',
      pending_attack_queue: [firstAttacker, secondAttacker],
    })

    const { roomUpdates } = await mountHookWithRoom(roomData, handData)

    await act(async () => {
      jest.advanceTimersByTime(850)
      await Promise.resolve()
    })

    expect(roomUpdates).toHaveLength(0)
  })

  it('still lets the defender resolve the revealed duel after the attacker auto-reveal', async () => {
    const attackerCard = createCard('attacker-1', 8)
    const defenderCard = createCard('defender-1', 3)
    const roomData = createRoomRow({
      player_a_uid: 'uid-a',
      player_b_uid: 'uid-b',
      attacker_side: 'a',
      public_state: createPublicState({
        combat: {
          attackerSlotsTotal: 3,
          attackerCardsRevealed: [attackerCard],
          revealedCard: attackerCard,
          defenderCommitted: true,
          pendingTies: [],
          resolvedDuels: [],
        },
      }),
    })
    const handData = createHandRow({
      player_uid: 'uid-b',
      pending_defender_pool: [defenderCard],
    })

    const hook = await mountHookWithRoom(roomData, handData)

    act(() => {
      hook.result.current.actions.selectDefenderCard(defenderCard.id)
    })

    expect(hook.roomUpdates).toHaveLength(1)
    expect(hook.roomUpdates[0]).toMatchObject({
      version: roomData.version + 1,
      public_state: {
        combat: {
          revealedCard: null,
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
      },
    })
  })

  it('marks the room as abandoned before clearing local multiplayer state when leaving an active room', async () => {
    const roomData = createRoomRow()
    const handData = createHandRow({
      player_uid: 'uid-a',
    })

    const hook = await mountHookWithRoom(roomData, handData)

    await act(async () => {
      await hook.result.current.actions.leaveRoom()
    })

    expect(hook.roomUpdates).toContainEqual(
      expect.objectContaining({
        status: 'abandoned',
        abandoned_by: 'uid-a',
      }),
    )
    expect(hook.result.current.roomStatus).toBeNull()
    expect(window.localStorage.getItem(ROOM_CODE_STORAGE_KEY)).toBeNull()
  })

  it('clears the stale room code and surfaces an opponent-abandoned notice when realtime marks the room as abandoned', async () => {
    const roomData = createRoomRow()
    const handData = createHandRow({
      player_uid: 'uid-a',
    })

    const hook = await mountHookWithRoom(roomData, handData)

    act(() => {
      hook.emitRoomChange({
        ...roomData,
        status: 'abandoned' as RoomRow['status'],
        abandoned_by: 'uid-b',
      })
    })

    await waitFor(() => {
      expect(hook.result.current.roomStatus).toBeNull()
    })

    expect((hook.result.current as unknown as { statusNotice: string | null }).statusNotice).toBe('opponent-abandoned')
    expect(window.localStorage.getItem(ROOM_CODE_STORAGE_KEY)).toBeNull()
  })

  it.each([
    ['finished'],
    ['abandoned'],
  ])('refuses to reconnect to a stored %s room on bootstrap and clears its stale room code', async (status) => {
    const roomData = createRoomRow({
      status: status as RoomRow['status'],
    })
    const handData = createHandRow({
      player_uid: 'uid-a',
    })

    const { client, channel } = createMockSupabase(roomData, handData)

    mockedEnsureAnonymousSession.mockResolvedValue(handData.player_uid)
    mockedGetSupabaseClient.mockReturnValue(client as never)
    mockedWriteWithVersionGuard.mockImplementation(async (update, expectedVersion) => {
      await update(expectedVersion)
      return { ok: true }
    })

    window.localStorage.setItem(ROOM_CODE_STORAGE_KEY, roomData.code)

    const hook = renderHook(() => useMultiplayerGameState())

    await waitFor(() => {
      expect(window.localStorage.getItem(ROOM_CODE_STORAGE_KEY)).toBeNull()
    })

    expect(hook.result.current.roomStatus).toBeNull()
    expect(hook.result.current.roomCode).toBeNull()
    expect(client.channel).not.toHaveBeenCalled()
    expect(channel.unsubscribe).not.toHaveBeenCalled()
  })
})
