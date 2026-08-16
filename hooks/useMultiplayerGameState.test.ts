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
