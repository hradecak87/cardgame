'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient, ensureAnonymousSession } from '@/lib/multiplayer/supabaseClient'
import { buildGameStateView, writeWithVersionGuard } from '@/lib/multiplayer/roomSync'
import type { PlayerHandRow, PlayerSlot, PublicState, RoomRow } from '@/lib/multiplayer/types'
import {
  assignDefenderCard,
  finalizeCombat,
  isCombatFinished,
  revealNextAttacker as revealNextCombatAttacker,
} from '@/lib/game/combat'
import { ageRestingCards, addWinnersToRest } from '@/lib/game/rest'
import { computeSlotCount } from '@/lib/game/state'
import type { GameState, CombatState as SinglePlayerCombatState, Duel } from '@/lib/game/types'
import { getAutoAdvanceAction } from './useGameState'

export const ROOM_CODE_STORAGE_KEY = 'battle-card-game-multiplayer-room-code'

export function loadStoredRoomCode(rawValue: string | null): string | null {
  return rawValue && /^\d{5}$/.test(rawValue) ? rawValue : null
}

function isTerminalRoomStatus(status: RoomRow['status'] | null | undefined): status is 'finished' | 'abandoned' {
  return status === 'finished' || status === 'abandoned'
}

interface RoomState {
  roomId: string | null
  roomCode: string | null
  ownSlot: PlayerSlot | null
  ownUid: string | null
  roomData: RoomRow | null
  ownHand: PlayerHandRow | null
  publicState: PublicState | null
  version: number
  status: RoomRow['status'] | null
  isPeerConnected: boolean
  connectionStatus: 'connected' | 'reconnecting'
}

const INITIAL_ROOM_STATE: RoomState = {
  roomId: null,
  roomCode: null,
  ownSlot: null,
  ownUid: null,
  roomData: null,
  ownHand: null,
  publicState: null,
  version: 0,
  status: null,
  isPeerConnected: false,
  connectionStatus: 'connected',
}

export function useMultiplayerGameState(): {
  state: GameState | null
  roomStatus: RoomRow['status'] | null
  roomCode: string | null
  publicPhase: PublicState['phase'] | null
  isPeerConnected: boolean
  ownNickname: string | null
  opponentNickname: string | null
  ownRoundSummaryDismissed: boolean
  opponentRoundSummaryDismissed: boolean
  statusNotice: 'opponent-abandoned' | null
  actions: {
    createRoom: (nickname: string) => Promise<{ ok: true; code: string } | { ok: false; reason: string }>
    joinRoom: (code: string, nickname: string) => Promise<{ ok: true } | { ok: false; reason: string }>
    confirmDefenderSelection: (cardIds: string[]) => void
    revealNextAttacker: () => void
    selectDefenderCard: (cardId: string) => void
    dismissRoundResult: () => void
    leaveRoom: () => Promise<void>
    clearStatusNotice: () => void
  }
} {
  const [room, setRoom] = useState<RoomState>(INITIAL_ROOM_STATE)
  const [statusNotice, setStatusNotice] = useState<'opponent-abandoned' | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const dealTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoRevealTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to update room state
  const updateRoom = useCallback((updates: Partial<RoomState>) => {
    setRoom((prev) => ({ ...prev, ...updates }))
  }, [])

  const clearRoomState = useCallback((notice: 'opponent-abandoned' | null = null) => {
    if (dealTimeoutRef.current) {
      clearTimeout(dealTimeoutRef.current)
      dealTimeoutRef.current = null
    }

    if (autoRevealTimeoutRef.current) {
      clearTimeout(autoRevealTimeoutRef.current)
      autoRevealTimeoutRef.current = null
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    channelRef.current = null
    localStorage.removeItem(ROOM_CODE_STORAGE_KEY)
    setRoom(INITIAL_ROOM_STATE)
    setStatusNotice(notice)
  }, [])

  // Fetch player hand from Supabase
  const fetchPlayerHand = useCallback(
    async (roomId: string, playerUid: string): Promise<PlayerHandRow | null> => {
      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase
          .from('player_hands')
          .select('*')
          .eq('room_id', roomId)
          .eq('player_uid', playerUid)
          .maybeSingle()

        if (error) {
          console.error('Error fetching player hand:', error)
          return null
        }

        return data as PlayerHandRow | null
      } catch (error) {
        console.error('Error fetching player hand:', error)
        return null
      }
    },
    [],
  )

  // Fetch room from Supabase
  const fetchRoom = useCallback(async (roomId: string): Promise<RoomRow | null> => {
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle()

      if (error) {
        console.error('Error fetching room:', error)
        return null
      }

      return data as RoomRow | null
    } catch (error) {
      console.error('Error fetching room:', error)
      return null
    }
  }, [])

  // Fetch room by code
  const fetchRoomByCode = useCallback(async (code: string): Promise<RoomRow | null> => {
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle()

      if (error) {
        console.error('Error fetching room by code:', error)
        return null
      }

      return data as RoomRow | null
    } catch (error) {
      console.error('Error fetching room by code:', error)
      return null
    }
  }, [])

  // Connect to a room (shared logic for create/join/restore)
  const connectToRoom = useCallback(
    async (code: string, requestedSlot?: PlayerSlot): Promise<{ ok: true } | { ok: false; reason: string }> => {
      try {
        const supabase = getSupabaseClient()
        const playerUid = await ensureAnonymousSession()
        if (!playerUid) {
          console.error('No session')
          return { ok: false, reason: 'No session' }
        }

        const roomData = await fetchRoomByCode(code)
        if (!roomData) {
          console.error('Room not found')
          return { ok: false, reason: 'Room not found' }
        }

        if (isTerminalRoomStatus(roomData.status)) {
          clearRoomState()
          return { ok: false, reason: `Room is ${roomData.status}` }
        }

        // Determine own slot if not already set
        let ownSlot: PlayerSlot | null = requestedSlot || null
        if (!ownSlot) {
          if (roomData.player_a_uid === playerUid) {
            ownSlot = 'a'
          } else if (roomData.player_b_uid === playerUid) {
            ownSlot = 'b'
          } else {
            console.error('Player not in this room')
            return { ok: false, reason: 'Player not in this room' }
          }
        }

        // Fetch own hand. This can legitimately be null at this point: the
        // player_hands row is only created by the deal_room() RPC once both
        // seats are filled, so a freshly created ('waiting') or just-joined
        // ('dealing', before deal_room() has run) room has no hand yet.
        // We must still register the room/subscribe so the UI can show the
        // waiting/room-code screen and so realtime updates (status flipping
        // to 'dealing'/'playing', and the hand becoming available) are
        // received — bailing out here would silently strand the client.
        const hand = await fetchPlayerHand(roomData.id, playerUid)

        // Update room state
        updateRoom({
          roomId: roomData.id,
          roomCode: code,
          ownSlot,
          ownUid: playerUid,
          roomData,
          ownHand: hand,
          publicState: roomData.public_state,
          version: roomData.version,
          status: roomData.status,
        })

        // Subscribe to Realtime updates
        subscribeToRoom(roomData.id, code, ownSlot, playerUid)

        return { ok: true }
      } catch (error) {
        console.error('Error connecting to room:', error)
        return { ok: false, reason: error instanceof Error ? error.message : 'Unknown error' }
      }
    },
    [clearRoomState, fetchRoomByCode, fetchPlayerHand, updateRoom],
  )

  // Subscribe to room updates via Realtime
  const subscribeToRoom = useCallback(
    (roomId: string, code: string, ownSlot: PlayerSlot, playerUid: string) => {
      const supabase = getSupabaseClient()

      // Unsubscribe from previous channel if exists
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }

      const channel = supabase
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            if (payload.new && typeof payload.new === 'object') {
              const newRoom = payload.new as RoomRow

              if (newRoom.status === 'abandoned') {
                const wasAbandonedByOpponent = Boolean(newRoom.abandoned_by && newRoom.abandoned_by !== playerUid)
                clearRoomState(wasAbandonedByOpponent ? 'opponent-abandoned' : null)
                return
              }

              updateRoom({
                roomData: newRoom,
                publicState: newRoom.public_state,
                version: newRoom.version,
                status: newRoom.status,
              })

              // Refetch player hand when needed
              fetchPlayerHand(roomId, playerUid).then((hand) => {
                if (hand) {
                  updateRoom({ ownHand: hand })
                }
              })
            }
          },
        )
        .on('presence', { event: 'sync' }, () => {
          const presenceState = channel.presenceState()
          const otherSlot = ownSlot === 'a' ? 'b' : 'a'
          const otherPresent = Object.values(presenceState).some(
            (users: any) => Array.isArray(users) && users.some((u: any) => u.slot === otherSlot),
          )
          updateRoom({ isPeerConnected: otherPresent })
        })
        .on('presence', { event: 'join' }, () => {
          const presenceState = channel.presenceState()
          const otherSlot = ownSlot === 'a' ? 'b' : 'a'
          const otherPresent = Object.values(presenceState).some(
            (users: any) => Array.isArray(users) && users.some((u: any) => u.slot === otherSlot),
          )
          updateRoom({ isPeerConnected: otherPresent })
        })
        .on('presence', { event: 'leave' }, () => {
          const presenceState = channel.presenceState()
          const otherSlot = ownSlot === 'a' ? 'b' : 'a'
          const otherPresent = Object.values(presenceState).some(
            (users: any) => Array.isArray(users) && users.some((u: any) => u.slot === otherSlot),
          )
          updateRoom({ isPeerConnected: otherPresent })
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            updateRoom({ connectionStatus: 'connected' })
            // Track presence
            channel.track({ slot: ownSlot })
          } else {
            updateRoom({ connectionStatus: 'reconnecting' })
          }
        })

      channelRef.current = channel
      unsubscribeRef.current = () => {
        channel.unsubscribe()
      }
    },
    [clearRoomState, updateRoom, fetchPlayerHand],
  )

  // Handle room status changes (e.g., from 'waiting' to 'dealing')
  useEffect(() => {
    if (room.status === 'dealing' && room.roomData && room.ownSlot === 'b' && room.roomId) {
      // Player B should trigger deal_room if still in dealing state
      const dealRoom = async () => {
        try {
          const supabase = getSupabaseClient()
          await supabase.rpc('deal_room', { p_room_id: room.roomId })
        } catch (error) {
          console.error('Error dealing room:', error)
          // Retry after 5s
          dealTimeoutRef.current = setTimeout(() => {
            dealRoom()
          }, 5000)
        }
      }

      dealRoom()
    }

    return () => {
      if (dealTimeoutRef.current) {
        clearTimeout(dealTimeoutRef.current)
      }
    }
  }, [room.status, room.roomData, room.ownSlot, room.roomId])

  // Realtime-fallback polling: postgres_changes events can occasionally be
  // missed (dropped WebSocket frame, brief disconnect that reconnects
  // without replaying missed events, etc.), which previously left a client
  // stuck showing a stale status (e.g. still on the "waiting for player"
  // screen after the room actually finished dealing) until a manual page
  // refresh re-ran connectToRoom's one-shot fetch. This periodically
  // re-fetches the authoritative room + own hand rows directly as a
  // cheap, idempotent safety net on top of (not a replacement for)
  // Realtime, self-healing within a few seconds instead of requiring a
  // reload.
  useEffect(() => {
    if (!room.roomId || !room.ownUid || isTerminalRoomStatus(room.status)) {
      return
    }

    const pollRoomId = room.roomId
    const pollOwnUid = room.ownUid

    const intervalId = setInterval(async () => {
      const [freshRoom, freshHand] = await Promise.all([
        fetchRoom(pollRoomId),
        fetchPlayerHand(pollRoomId, pollOwnUid),
      ])

      if (freshRoom) {
        if (freshRoom.status === 'abandoned') {
          const wasAbandonedByOpponent = Boolean(freshRoom.abandoned_by && freshRoom.abandoned_by !== pollOwnUid)
          clearRoomState(wasAbandonedByOpponent ? 'opponent-abandoned' : null)
          return
        }

        updateRoom({
          roomData: freshRoom,
          publicState: freshRoom.public_state,
          version: freshRoom.version,
          status: freshRoom.status,
        })
      }

      if (freshHand) {
        updateRoom({ ownHand: freshHand })
      }
    }, 3000)

    return () => {
      clearInterval(intervalId)
    }
  }, [room.roomId, room.ownUid, room.status, fetchRoom, fetchPlayerHand, updateRoom, clearRoomState])

  // Reconciliation effect - applies round end, publishes results, and transitions to next round
  useEffect(() => {
    if (!room.publicState || !room.ownHand || !room.ownSlot || !room.roomId || !room.roomData) {
      return
    }

    let cancelled = false

    const reconcile = async () => {
      const supabase = getSupabaseClient()
      let publicState = room.publicState
      let ownHand = room.ownHand
      const ownSlot = room.ownSlot
      const roomId = room.roomId
      let version = room.version
      let roomData = room.roomData

      if (!publicState || !ownHand || !roomData) {
        return
      }

      // Stage A: Apply own round end privately
      const shouldApplyRound =
        publicState.phase === 'round-summary' &&
        publicState.roundSummaryDismissedBy.a &&
        publicState.roundSummaryDismissedBy.b &&
        ownHand.last_applied_round < publicState.roundNumber

      if (shouldApplyRound) {
        // Apply round end logic
        let army = {
          available: [...ownHand.available],
          resting: [...ownHand.resting],
        }

        // Age resting cards
        army = ageRestingCards(army)

        // Add winners to rest
        if (publicState.combat && publicState.combat.resolvedDuels.length > 0) {
          const isAttacker = ownSlot === roomData.attacker_side
          const victoriousDuels = publicState.combat.resolvedDuels.filter(
            (entry) => (isAttacker && entry.winner === 'attacker') || (!isAttacker && entry.winner === 'defender'),
          )

          if (victoriousDuels.length > 0) {
            const capturedCards = victoriousDuels.map((entry) =>
              isAttacker ? entry.duel.defenderCard : entry.duel.attackerCard,
            )
            army = addWinnersToRest(army, capturedCards, 2) // TODO: get restRounds from config
          }
        }

        // Write to player_hands
        try {
          await supabase
            .from('player_hands')
            .update({
              available: army.available,
              resting: army.resting,
              pending_attack_queue: null,
              pending_defender_pool: null,
              last_applied_round: publicState.roundNumber,
            })
            .eq('room_id', roomId)
            .eq('player_uid', ownHand.player_uid)

          if (cancelled) {
            return
          }

          ownHand = {
            ...ownHand,
            available: army.available,
            resting: army.resting,
            pending_attack_queue: null,
            pending_defender_pool: null,
            last_applied_round: publicState.roundNumber,
          }

          // Update local state
          updateRoom({
            ownHand,
          })
        } catch (error) {
          console.error('Error applying round end:', error)
        }
      }

      // Stage B: Publish own completion flag
      if (
        ownHand.last_applied_round === publicState.roundNumber &&
        ownSlot &&
        !publicState.roundEndAppliedBy[ownSlot]
      ) {
        const updatedAvailable = ownHand.available
        const updatedResting = ownHand.resting

        const updates: Partial<PublicState> = {
          ...publicState,
          roundEndAppliedBy: { ...publicState.roundEndAppliedBy, [ownSlot]: true },
        }

        if (ownSlot === 'a') {
          updates.playerA = {
            availableCount: updatedAvailable.length,
            resting: updatedResting,
          }
        } else {
          updates.playerB = {
            availableCount: updatedAvailable.length,
            resting: updatedResting,
          }
        }

        const writeResult = await writeWithVersionGuard(async (expectedVersion) => {
          const result = await supabase
            .from('rooms')
            .update({
              public_state: updates,
              version: version + 1,
            })
            .eq('id', roomId)
            .eq('version', expectedVersion)

          return { affectedRows: result.status === 204 ? 1 : 0 }
        }, version)

        if (!writeResult.ok) {
          console.error('Error publishing round completion:', writeResult)
        } else {
          publicState = updates as PublicState
          version += 1
          roomData = {
            ...roomData,
            public_state: publicState,
            version,
          }

          updateRoom({
            publicState,
            roomData,
            version,
          })
        }
      }

      // Tie finalization (defender-only): finalizeCombat if needed and transition to round-summary
      if (
        publicState.phase === 'combat' &&
        publicState.combat &&
        publicState.combat.revealedCard === null &&
        publicState.combat.attackerCardsRevealed.length === publicState.combat.attackerSlotsTotal &&
        publicState.combat.pendingTies.length > 0 &&
        roomData.attacker_side !== ownSlot
      ) {
        // Defender finalizes ties - construct a CombatState to pass to finalizeCombat
        const combatForFinalize: SinglePlayerCombatState = {
          attackerQueue: [],
          revealedCard: null,
          defenderPool: [],
          pendingTies: publicState.combat.pendingTies,
          resolvedDuels: publicState.combat.resolvedDuels,
        }

        const finalizedCombat = finalizeCombat(combatForFinalize)

        const updates: Partial<PublicState> = {
          ...publicState,
          combat: {
            attackerSlotsTotal: publicState.combat.attackerSlotsTotal,
            attackerCardsRevealed: publicState.combat.attackerCardsRevealed,
            revealedCard: finalizedCombat.revealedCard,
            defenderCommitted: publicState.combat.defenderCommitted,
            defenderPoolCards: publicState.combat.defenderPoolCards ?? [],
            pendingTies: finalizedCombat.pendingTies,
            resolvedDuels: finalizedCombat.resolvedDuels,
          },
        }

        const writeResult = await writeWithVersionGuard(async (expectedVersion) => {
          const result = await supabase
            .from('rooms')
            .update({
              public_state: updates,
              version: version + 1,
            })
            .eq('id', roomId)
            .eq('version', expectedVersion)

          return { affectedRows: result.status === 204 ? 1 : 0 }
        }, version)

        if (!writeResult.ok) {
          // Ignore version conflicts - someone else finalized it
        }

        // Return early; we'll run the phase transition check next reconcile pass
        return
      }

      // Phase transition to round-summary (defender-only): once ties are finalized, transition phase
      if (
        publicState.phase === 'combat' &&
        publicState.combat &&
        publicState.combat.revealedCard === null &&
        publicState.combat.attackerCardsRevealed.length === publicState.combat.attackerSlotsTotal &&
        publicState.combat.pendingTies.length === 0 &&
        roomData.attacker_side !== ownSlot
      ) {
        const updates: Partial<PublicState> = {
          ...publicState,
          phase: 'round-summary',
        }

        const writeResult = await writeWithVersionGuard(async (expectedVersion) => {
          const result = await supabase
            .from('rooms')
            .update({
              public_state: updates,
              version: version + 1,
            })
            .eq('id', roomId)
            .eq('version', expectedVersion)

          return { affectedRows: result.status === 204 ? 1 : 0 }
        }, version)

        if (!writeResult.ok) {
          // Ignore version conflicts - someone else transitioned it
        }

        return
      }

      // Shared conclusion: Both players can submit this
      if (
        publicState.roundEndAppliedBy.a &&
        publicState.roundEndAppliedBy.b &&
        publicState.phase !== 'game-over' &&
        roomData.attacker_side === ownSlot
      ) {
        const currentAttackerSide = roomData.attacker_side
        const playerACards = publicState.playerA.availableCount + publicState.playerA.resting.length
        const playerBCards = publicState.playerB.availableCount + publicState.playerB.resting.length

        let winner: PlayerSlot | null = null
        let newStatus: 'finished' | 'playing' = 'playing'

        if (playerACards === 0) {
          winner = 'b'
          newStatus = 'finished'
        } else if (playerBCards === 0) {
          winner = 'a'
          newStatus = 'finished'
        }

        const newPhase = newStatus === 'finished' ? 'game-over' : 'selecting'

        const updates: Partial<PublicState> = {
          ...publicState,
          roundNumber: publicState.roundNumber + 1,
          phase: newPhase,
          combat: null,
          roundSummaryDismissedBy: { a: false, b: false },
          roundEndAppliedBy: { a: false, b: false },
        }

        const writeResult = await writeWithVersionGuard(async (expectedVersion) => {
          const result = await supabase
            .from('rooms')
            .update({
              public_state: updates,
              attacker_side: currentAttackerSide === 'a' ? 'b' : 'a',
              winner,
              status: newStatus,
              version: version + 1,
            })
            .eq('id', roomId)
            .eq('version', expectedVersion)

          return { affectedRows: result.status === 204 ? 1 : 0 }
        }, version)

        if (!writeResult.ok) {
          console.error('Error publishing shared conclusion:', writeResult)
        } else {
          const nextAttackerSide = currentAttackerSide === 'a' ? 'b' : 'a'
          publicState = updates as PublicState
          version += 1
          roomData = {
            ...roomData,
            public_state: publicState,
            attacker_side: nextAttackerSide,
            winner,
            status: newStatus,
            version,
          }

          updateRoom({
            publicState,
            roomData,
            status: newStatus,
            version,
          })
        }
      }
    }

    reconcile().catch((error) => {
      console.error('Unhandled error in reconciliation effect:', error)
    })

    return () => {
      cancelled = true
    }
  }, [room.publicState, room.ownHand, room.ownSlot, room.roomId, room.version])

  // Automatic attacker card draw on phase entry
  useEffect(() => {
    if (
      !room.publicState ||
      !room.ownHand ||
      !room.ownSlot ||
      !room.roomId ||
      room.publicState.phase !== 'selecting' ||
      room.publicState.combat !== null
    ) {
      return
    }

    const isAttacker = room.roomData?.attacker_side === room.ownSlot

    if (!isAttacker) {
      return
    }

    // Check if already drew
    if (room.ownHand.pending_attack_queue) {
      // Already drew; publish initial combat state if not already published
      if (room.publicState.combat) {
        return
      }

      // BUG FIX #3: Dynamically determine defender side (opposite of attacker_side)
      const defenderSlot = room.roomData?.attacker_side === 'a' ? 'b' : 'a'
      const defenderStats = defenderSlot === 'a' ? room.publicState.playerA : room.publicState.playerB
      // BUG FIX #4: Only the defender's currently *available* cards can be selected for
      // defense - resting cards can't play, so they must not inflate the slot cap
      // (previously counted availableCount + resting.length, which mismatched
      // computeSlotCount()'s selection-required count once troops started resting
      // and permanently softlocked the round).
      const defenderTotal = defenderStats.availableCount
      const slotCount = Math.min(room.ownHand.available.length + room.ownHand.pending_attack_queue.length, defenderTotal)

      const initialCombat = {
        attackerSlotsTotal: slotCount,
        attackerCardsRevealed: [],
        revealedCard: null,
        defenderCommitted: false,
        defenderPoolCards: [],
        pendingTies: [],
        resolvedDuels: [],
      }

      const updates: Partial<PublicState> = {
        ...room.publicState,
        combat: initialCombat,
      }

      const supabase = getSupabaseClient()
      writeWithVersionGuard(async (expectedVersion) => {
        const result = await supabase
          .from('rooms')
          .update({
            public_state: updates,
            version: room.version + 1,
          })
          .eq('id', room.roomId)
          .eq('version', expectedVersion)

        return { affectedRows: result.status === 204 ? 1 : 0 }
      }, room.version).catch(() => {
        // Silently ignore conflicts
      })

      return
    }

    // Draw 3 random cards from available
    const deckSize = room.ownHand.available.length
    if (deckSize === 0) {
      return
    }

    const drawCount = Math.min(3, deckSize)
    const drawnIndices = new Set<number>()

    while (drawnIndices.size < drawCount) {
      drawnIndices.add(Math.floor(Math.random() * deckSize))
    }

    const drawnCards = Array.from(drawnIndices)
      .sort((a, b) => a - b)
      .reverse() // Reverse to avoid index shifting
      .map((i) => room.ownHand!.available[i])

    const remainingAvailable = room.ownHand.available.filter((_, i) => !drawnIndices.has(i))

    // Write to pending_attack_queue privately
    const updatePrivate = async () => {
      try {
        const supabase = getSupabaseClient()
        await supabase
          .from('player_hands')
          .update({
            available: remainingAvailable,
            pending_attack_queue: drawnCards,
          })
          .eq('room_id', room.roomId)
          .eq('player_uid', room.ownHand!.player_uid)

        updateRoom({
          ownHand: {
            ...room.ownHand!,
            available: remainingAvailable,
            pending_attack_queue: drawnCards,
          },
        })

        // Now publish initial combat state
        // BUG FIX #3: Dynamically determine defender side (opposite of attacker_side)
        const defenderSlot = room.roomData?.attacker_side === 'a' ? 'b' : 'a'
        const defenderStats = defenderSlot === 'a' ? room.publicState!.playerA : room.publicState!.playerB
        // BUG FIX #4: see matching comment above - resting cards can't be selected for defense
        const defenderTotal = defenderStats.availableCount
        const slotCount = Math.min(drawnCards.length, defenderTotal)

        const initialCombat = {
          attackerSlotsTotal: slotCount,
          attackerCardsRevealed: [],
          revealedCard: null,
          defenderCommitted: false,
          defenderPoolCards: [],
          pendingTies: [],
          resolvedDuels: [],
        }

        const updates: Partial<PublicState> = {
          ...room.publicState!,
          combat: initialCombat,
        }

        const writeResult = await writeWithVersionGuard(async (expectedVersion) => {
          const result = await supabase
            .from('rooms')
            .update({
              public_state: updates,
              version: room.version + 1,
            })
            .eq('id', room.roomId)
            .eq('version', expectedVersion)

          return { affectedRows: result.status === 204 ? 1 : 0 }
        }, room.version)

        if (!writeResult.ok) {
          console.error('Error publishing initial combat state:', writeResult)
        }
      } catch (error) {
        console.error('Error drawing attacker cards:', error)
      }
    }

    updatePrivate()
  }, [room.publicState?.phase, room.publicState?.combat, room.ownHand?.pending_attack_queue, room.ownSlot, room.roomData?.attacker_side, room.roomId, room.ownHand?.available.length, room.publicState?.playerB.availableCount, room.publicState?.playerB.resting.length, room.version, room.ownHand?.player_uid, updateRoom])

  // Initial session bootstrap on mount
  useEffect(() => {
    const bootstrap = async () => {
      await ensureAnonymousSession()
      const storedCode = loadStoredRoomCode(localStorage.getItem(ROOM_CODE_STORAGE_KEY))
      if (storedCode) {
        await connectToRoom(storedCode)
      }
    }

    bootstrap()
  }, [connectToRoom])

  // Build GameState for rendering
  const state =
    room.publicState && room.ownHand && room.ownSlot
      ? buildGameStateView(room.publicState, room.ownSlot, room.ownHand, room.roomData?.attacker_side ?? undefined, room.roomData?.winner ?? null)
      : null

  // Action functions
  const createRoom = useCallback(
    async (nickname: string): Promise<{ ok: true; code: string } | { ok: false; reason: string }> => {
      try {
        const supabase = getSupabaseClient()
        const playerUid = await ensureAnonymousSession()
        if (!playerUid) {
          return { ok: false, reason: 'No session' }
        }

        // Import createRoomWithRetry from roomCode.ts
        const { createRoomWithRetry } = await import('@/lib/multiplayer/roomCode')

        const result = await createRoomWithRetry(async (code: string) => {
          try {
            const { error } = await supabase
              .from('rooms')
              .insert({
                code,
                player_a_nickname: nickname,
                player_a_uid: playerUid,
                status: 'waiting',
                version: 0,
                public_state: {
                  roundNumber: 1,
                  playerA: { availableCount: 0, resting: [] },
                  playerB: { availableCount: 0, resting: [] },
                  phase: 'selecting',
                  combat: null,
                  roundSummaryDismissedBy: { a: false, b: false },
                  roundEndAppliedBy: { a: false, b: false },
                },
              })

            if (error?.code === 'PGRST116') {
              // Unique constraint violation
              return { ok: false, reason: 'collision' }
            }
            if (error) {
              return { ok: false, reason: 'network-error' }
            }
            return { ok: true }
          } catch (e) {
            return { ok: false, reason: 'network-error' }
          }
        })

        if (!result.ok) {
          return { ok: false, reason: result.reason }
        }

        const code = result.code
        localStorage.setItem(ROOM_CODE_STORAGE_KEY, code)

        const connectResult = await connectToRoom(code, 'a')
        if (!connectResult.ok) {
          return { ok: false, reason: connectResult.reason }
        }

        return { ok: true, code }
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Unknown error' }
      }
    },
    [connectToRoom],
  )

  const joinRoom = useCallback(
    async (code: string, nickname: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      try {
        const supabase = getSupabaseClient()
        const playerUid = await ensureAnonymousSession()
        if (!playerUid) {
          return { ok: false, reason: 'No session' }
        }

        // Call join_room RPC. The DB function signature (migration 0002) is
        // join_room(p_code text, p_nickname text) — it derives the joiner's
        // uid itself via auth.uid(), it isn't passed as a parameter.
        const result = await supabase.rpc('join_room', {
          p_code: code,
          p_nickname: nickname,
        })

        if (result.error) {
          return { ok: false, reason: result.error.message }
        }

        localStorage.setItem(ROOM_CODE_STORAGE_KEY, code)

        const connectResult = await connectToRoom(code, 'b')
        if (!connectResult.ok) {
          return { ok: false, reason: connectResult.reason }
        }

        return { ok: true }
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Unknown error' }
      }
    },
    [connectToRoom],
  )

  const confirmDefenderSelection = useCallback(
    (cardIds: string[]) => {
      if (!room.ownHand || !room.publicState || !room.ownSlot || !room.roomId) {
        return
      }

      const isDefender = room.roomData?.attacker_side !== room.ownSlot

      if (!isDefender) {
        // Attacker should not call this
        return
      }

      // Check if already set (recovery path)
      if (room.ownHand.pending_defender_pool) {
        // Re-publish existing defenderCommitted flag
        const supabase = getSupabaseClient()
        const updates: Partial<PublicState> = {
          ...room.publicState,
          phase: 'combat',
        }
        if (updates.combat) {
          updates.combat.defenderCommitted = true
          updates.combat.defenderPoolCards = room.ownHand.pending_defender_pool
        }

        writeWithVersionGuard(async (expectedVersion) => {
          const result = await supabase
            .from('rooms')
            .update({
              public_state: updates,
              version: room.version + 1,
            })
            .eq('id', room.roomId)
            .eq('version', expectedVersion)

          return { affectedRows: result.status === 204 ? 1 : 0 }
        }, room.version).catch(() => {
          // Silently ignore conflicts on re-publish
        })
        return
      }

      // Move selected cards from available to pending_defender_pool
      const selectedCards = cardIds
        .map((id) => room.ownHand!.available.find((c) => c.id === id))
        .filter(Boolean) as any[]

      const remainingAvailable = room.ownHand.available.filter((c) => !cardIds.includes(c.id))

      // Update private hand
      const updatePrivate = async () => {
        try {
          const supabase = getSupabaseClient()
          await supabase
            .from('player_hands')
            .update({
              available: remainingAvailable,
              pending_defender_pool: selectedCards,
            })
            .eq('room_id', room.roomId)
            .eq('player_uid', room.ownHand!.player_uid)

          updateRoom({
            ownHand: {
              ...room.ownHand!,
              available: remainingAvailable,
              pending_defender_pool: selectedCards,
            },
          })

          // Now publish public state
          const updates: Partial<PublicState> = {
            ...room.publicState!,
            phase: 'combat',
            combat: room.publicState!.combat || {
              attackerSlotsTotal: 0,
              attackerCardsRevealed: [],
              revealedCard: null,
              defenderCommitted: false,
              defenderPoolCards: [],
              pendingTies: [],
              resolvedDuels: [],
            },
          }

          if (updates.combat) {
            updates.combat.defenderCommitted = true
            updates.combat.defenderPoolCards = selectedCards
          }

          const writeResult = await writeWithVersionGuard(async (expectedVersion) => {
            const result = await supabase
              .from('rooms')
              .update({
                public_state: updates,
                version: room.version + 1,
              })
              .eq('id', room.roomId)
              .eq('version', expectedVersion)

            return { affectedRows: result.status === 204 ? 1 : 0 }
          }, room.version)

          if (!writeResult.ok) {
            console.error('Error confirming defender selection:', writeResult)
          }
        } catch (error) {
          console.error('Error in confirmDefenderSelection:', error)
        }
      }

      updatePrivate()
    },
    [room, updateRoom],
  )

  const revealNextAttacker = useCallback(() => {
    if (!room.publicState || !room.ownSlot || !room.roomId || !room.ownHand) {
      return
    }

    const isAttacker = room.roomData?.attacker_side === room.ownSlot

    if (!isAttacker || !room.publicState.combat) {
      return
    }

    // BUG FIX #2: Check that previous duel is resolved (revealedCard must be null)
    if (room.publicState.combat.revealedCard !== null) {
      return
    }

    // Get next card from pending_attack_queue that hasn't been revealed yet
    const unrevealed = room.ownHand.pending_attack_queue?.filter(
      (card) => !room.publicState!.combat!.attackerCardsRevealed.some((c) => c.id === card.id),
    )

    if (!unrevealed || unrevealed.length === 0) {
      return
    }

    const nextCard = unrevealed[0]

    // Update public combat state
    const updatedCombat = {
      ...room.publicState.combat,
      attackerCardsRevealed: [...room.publicState.combat.attackerCardsRevealed, nextCard],
      revealedCard: nextCard,
    }

    const updates: Partial<PublicState> = {
      ...room.publicState,
      combat: updatedCombat,
    }

    const supabase = getSupabaseClient()
    writeWithVersionGuard(async (expectedVersion) => {
      const result = await supabase
        .from('rooms')
        .update({
          public_state: updates,
          version: room.version + 1,
        })
        .eq('id', room.roomId)
        .eq('version', expectedVersion)

      return { affectedRows: result.status === 204 ? 1 : 0 }
    }, room.version).catch((error) => {
      console.error('Error revealing next attacker card:', error)
    })
  }, [room])

  useEffect(() => {
    if (!state || !room.ownSlot || room.roomData?.attacker_side !== room.ownSlot || !room.publicState?.combat?.defenderCommitted) {
      return
    }

    if (getAutoAdvanceAction(state) !== 'reveal-next-attacker') {
      return
    }

    autoRevealTimeoutRef.current = setTimeout(() => {
      revealNextAttacker()
    }, 850)

    return () => {
      if (autoRevealTimeoutRef.current) {
        clearTimeout(autoRevealTimeoutRef.current)
      }
    }
  }, [revealNextAttacker, room.ownSlot, room.publicState?.combat?.defenderCommitted, room.roomData?.attacker_side, state])

  const selectDefenderCard = useCallback(
    (cardId: string) => {
      if (!room.publicState || !room.ownSlot || !room.roomId || !room.ownHand) {
        return
      }

      const isDefender = room.roomData?.attacker_side !== room.ownSlot

      if (!isDefender || !room.publicState.combat || !room.publicState.combat.revealedCard) {
        return
      }

      const card = room.ownHand.pending_defender_pool?.find((c) => c.id === cardId)
      if (!card) {
        return
      }

      const combatState: SinglePlayerCombatState = {
        attackerQueue: [],
        revealedCard: room.publicState.combat.revealedCard,
        defenderPool: room.ownHand.pending_defender_pool ?? [],
        resolvedDuels: room.publicState.combat.resolvedDuels,
        pendingTies: room.publicState.combat.pendingTies,
      }

      const result = assignDefenderCard(combatState, cardId)

      // BUG FIX #1: Propagate revealedCard: null from assignDefenderCard result
      let updatedCombat = {
        ...room.publicState.combat,
        resolvedDuels: result.resolvedDuels,
        pendingTies: result.pendingTies,
        revealedCard: result.revealedCard,
      }

      const updates: Partial<PublicState> = {
        ...room.publicState,
        combat: updatedCombat,
      }

      const supabase = getSupabaseClient()
      writeWithVersionGuard(async (expectedVersion) => {
        const result = await supabase
          .from('rooms')
          .update({
            public_state: updates,
            version: room.version + 1,
          })
          .eq('id', room.roomId)
          .eq('version', expectedVersion)

        return { affectedRows: result.status === 204 ? 1 : 0 }
      }, room.version).catch((error) => {
        console.error('Error selecting defender card:', error)
      })
    },
    [room],
  )

  const dismissRoundResult = useCallback(() => {
    if (!room.publicState || !room.ownSlot || !room.roomId) {
      return
    }

    const updates: Partial<PublicState> = {
      ...room.publicState,
      roundSummaryDismissedBy: {
        ...room.publicState.roundSummaryDismissedBy,
        [room.ownSlot]: true,
      },
    }

    const supabase = getSupabaseClient()
    writeWithVersionGuard(async (expectedVersion) => {
      const result = await supabase
        .from('rooms')
        .update({
          public_state: updates,
          version: room.version + 1,
        })
        .eq('id', room.roomId)
        .eq('version', expectedVersion)

      return { affectedRows: result.status === 204 ? 1 : 0 }
    }, room.version).catch((error) => {
      console.error('Error dismissing round result:', error)
    })
  }, [room])

  const leaveRoom = useCallback(async () => {
    const roomId = room.roomId
    const ownUid = room.ownUid
    const currentStatus = room.status

    clearRoomState()

    if (!roomId || !ownUid || !currentStatus || isTerminalRoomStatus(currentStatus)) {
      return
    }

    try {
      const supabase = getSupabaseClient()
      await supabase
        .from('rooms')
        .update({
          status: 'abandoned',
          abandoned_by: ownUid,
        })
        .eq('id', roomId)
    } catch (error) {
      console.error('Error abandoning room:', error)
    }
  }, [clearRoomState, room.ownUid, room.roomId, room.status])

  const clearStatusNotice = useCallback(() => {
    setStatusNotice(null)
  }, [])

  return {
    state,
    roomStatus: room.status,
    roomCode: room.roomCode,
    publicPhase: room.publicState?.phase ?? null,
    isPeerConnected: room.isPeerConnected,
    statusNotice,
    ownNickname:
      room.ownSlot === 'a'
        ? room.roomData?.player_a_nickname ?? null
        : room.roomData?.player_b_nickname ?? null,
    opponentNickname:
      room.ownSlot === 'a'
        ? room.roomData?.player_b_nickname ?? null
        : room.roomData?.player_a_nickname ?? null,
    ownRoundSummaryDismissed: room.ownSlot ? room.publicState?.roundSummaryDismissedBy[room.ownSlot] ?? false : false,
    opponentRoundSummaryDismissed: room.ownSlot
      ? room.publicState?.roundSummaryDismissedBy[room.ownSlot === 'a' ? 'b' : 'a'] ?? false
      : false,
    actions: {
      createRoom,
      joinRoom,
      confirmDefenderSelection,
      revealNextAttacker,
      selectDefenderCard,
      dismissRoundResult,
      leaveRoom,
      clearStatusNotice,
    },
  }
}
