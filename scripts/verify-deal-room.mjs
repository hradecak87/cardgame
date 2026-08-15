// One-off manual verification script for the deal_room()/join_room()
// Postgres functions. Usage: node scripts/verify-deal-room.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the
// environment (e.g. `set -a; source .env.local; node scripts/verify-deal-room.mjs`).
import { createClient } from '@supabase/supabase-js'

// Node < 22 has no native WebSocket global, which @supabase/supabase-js's
// Realtime client requires even though this script never subscribes to
// anything. Polyfill it with the `ws` package (devDependency) so this
// script runs on the project's actual Node version.
if (typeof globalThis.WebSocket === 'undefined') {
  const { default: WebSocket } = await import('ws')
  globalThis.WebSocket = WebSocket
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.')
  process.exit(1)
}

const RUNS = Number(process.env.VERIFY_DEAL_ROOM_RUNS ?? 20)
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
const POWER_BY_RANK = { '7': 1, '8': 2, '9': 3, '10': 4, J: 5, Q: 6, K: 7, A: 8 }
const CANONICAL_DECK_IDS = new Set(
  SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}-${suit}`)),
)

function assertValidHand(cards, label) {
  if (!Array.isArray(cards) || cards.length !== 16) {
    throw new Error(`${label}: expected 16 cards, got ${cards?.length}`)
  }

  const aceCount = cards.filter((card) => card.rank === 'A').length
  if (aceCount !== 2) {
    throw new Error(`${label}: expected exactly 2 Aces, got ${aceCount}`)
  }

  const ids = new Set(cards.map((card) => card.id))
  if (ids.size !== 16) {
    throw new Error(`${label}: duplicate card ids found`)
  }

  for (const card of cards) {
    if (!CANONICAL_DECK_IDS.has(card.id)) {
      throw new Error(`${label}: unknown card id ${card.id}`)
    }

    if (!SUITS.includes(card.suit) || !RANKS.includes(card.rank)) {
      throw new Error(`${label}: malformed card ${JSON.stringify(card)}`)
    }

    if (card.power !== POWER_BY_RANK[card.rank]) {
      throw new Error(`${label}: wrong power for ${card.rank}: ${card.power}`)
    }
  }
}

/**
 * Confirms the two hands together form exactly the canonical 32-card deck
 * (no card missing, none duplicated across hands) — assertValidHand already
 * checked each hand individually has no internal duplicates/unknown ids.
 */
function assertHandsFormFullDeck(handA, handB) {
  const combinedIds = new Set([...handA.map((card) => card.id), ...handB.map((card) => card.id)])

  if (combinedIds.size !== 32) {
    throw new Error(`Combined hands: expected 32 unique cards, got ${combinedIds.size}`)
  }

  for (const id of CANONICAL_DECK_IDS) {
    if (!combinedIds.has(id)) {
      throw new Error(`Combined hands: missing card ${id}`)
    }
  }
}

async function runOnce(runIndex) {
  // Two independent clients/sessions = two independent "browsers".
  const clientA = createClient(url, anonKey)
  const clientB = createClient(url, anonKey)
  const { data: authA, error: authAError } = await clientA.auth.signInAnonymously()
  if (authAError) throw authAError
  const { data: authB, error: authBError } = await clientB.auth.signInAnonymously()
  if (authBError) throw authBError

  // Vary the code per run with a random suffix-free 5-digit value derived
  // from Date.now() so a prior failed run's leftover row (see the `finally`
  // cleanup below) can't collide with this run's code.
  const code = `${(Date.now() + runIndex) % 100000}`.padStart(5, '0')

  const { data: room, error: insertError } = await clientA
    .from('rooms')
    .insert({ code, status: 'waiting', player_a_uid: authA.user.id })
    .select()
    .single()
  if (insertError) throw insertError

  let roomId = room.id

  try {
    const { data: joinResult, error: joinError } = await clientB.rpc('join_room', {
      p_code: code,
      p_nickname: 'Player B',
    })
    if (joinError) throw joinError

    roomId = joinResult[0].room_id

    // Matches the real lifecycle: it's player B's client that wins the
    // 'waiting' -> 'dealing' race (via join_room) and is therefore the one
    // responsible for calling deal_room, per the Room Lifecycle section.
    const { error: dealError } = await clientB.rpc('deal_room', { p_room_id: roomId })
    if (dealError) throw dealError

    const { data: handA, error: handAError } = await clientA
      .from('player_hands')
      .select('available')
      .eq('room_id', roomId)
      .eq('player_uid', authA.user.id)
      .single()
    if (handAError) throw handAError

    const { data: handB, error: handBError } = await clientB
      .from('player_hands')
      .select('available')
      .eq('room_id', roomId)
      .eq('player_uid', authB.user.id)
      .single()
    if (handBError) throw handBError

    assertValidHand(handA.available, `Run ${runIndex} player A`)
    assertValidHand(handB.available, `Run ${runIndex} player B`)
    assertHandsFormFullDeck(handA.available, handB.available)
  } finally {
    // Always attempt cleanup, even on assertion failure, so a rerun doesn't
    // collide with this run's leftover row.
    const { error: deleteError } = await clientA.from('rooms').delete().eq('id', roomId)
    if (deleteError) throw deleteError
  }
}

for (let i = 0; i < RUNS; i += 1) {
  await runOnce(i)
}

console.log(`OK: ${RUNS} deal_room() runs each produced two disjoint 16-card hands with exactly 2 Aces each.`)
