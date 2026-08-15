import type { Army, Card, CombatState, GameState, RestingCard, Side } from '@/lib/game/types'
import type { PlayerHandRow, PlayerSlot, PublicState } from './types'

const OTHER_SLOT: Record<PlayerSlot, PlayerSlot> = { a: 'b', b: 'a' }

function placeholderCards(count: number, slotLabel: string): Card[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `hidden-${slotLabel}-${index}`,
    // Rank/suit/power are meaningless placeholders: this array only ever
    // has its .length read (opponent's real available cards are private
    // and never sent over the network).
    rank: '7',
    suit: 'hearts',
    power: 0,
  }))
}

function buildOpponentArmy(publicState: PublicState, opponentSlot: PlayerSlot): Army {
  // Defensive fallback: public_state is a single JSONB column overwritten
  // wholesale on every write, so a bug in any writer that forgets to spread
  // the previous state could otherwise drop playerA/playerB entirely and
  // crash every client's render. Missing data degrades to "empty" instead
  // of throwing.
  const opponentPublic = (opponentSlot === 'a' ? publicState.playerA : publicState.playerB) ?? {
    availableCount: 0,
    resting: [],
  }

  return {
    available: placeholderCards(opponentPublic.availableCount, opponentSlot),
    resting: opponentPublic.resting.map((entry): RestingCard => ({
      card: entry.card,
      roundsRemaining: entry.roundsRemaining,
    })),
  }
}

function buildOwnArmy(ownHand: PlayerHandRow): Army {
  return {
    available: ownHand.available,
    resting: ownHand.resting.map((entry): RestingCard => ({
      card: entry.card,
      roundsRemaining: entry.roundsRemaining,
    })),
  }
}

function buildCombatView(
  publicState: PublicState,
  ownSlot: PlayerSlot,
  ownHand: PlayerHandRow,
  attackerSlot: PlayerSlot | undefined,
): CombatState | null {
  if (!publicState.combat) {
    return null
  }

  const isOwnAttacker = attackerSlot === ownSlot
  const revealedAttackerCardIds = new Set(publicState.combat.attackerCardsRevealed.map((card) => card.id))
  // Also exclude the currently displayed revealedCard
  if (publicState.combat.revealedCard) {
    revealedAttackerCardIds.add(publicState.combat.revealedCard.id)
  }
  const usedDefenderCardIds = new Set([
    ...publicState.combat.resolvedDuels.map((entry) => entry.duel.defenderCard.id),
    ...publicState.combat.pendingTies.map((duel) => duel.defenderCard.id),
  ])
  const remainingAttackerCount = publicState.combat.attackerSlotsTotal - publicState.combat.attackerCardsRevealed.length
  const consumedDefenderCount = publicState.combat.resolvedDuels.length + publicState.combat.pendingTies.length
  const remainingDefenderCount = publicState.combat.attackerSlotsTotal - consumedDefenderCount

  // Only the attacker knows the real identity of its own not-yet-revealed
  // cards; the defender only ever needs isCombatFinished's *length* check,
  // so it gets count-only placeholders. Symmetrically, only the defender
  // knows the real identity of its remaining defenderPool picks; the
  // attacker only ever needs the count, never the identities (it can't
  // pick from the defender's pool).
  return {
    attackerQueue: isOwnAttacker
      ? (ownHand.pending_attack_queue ?? []).filter((card) => !revealedAttackerCardIds.has(card.id))
      : placeholderCards(remainingAttackerCount, `${ownSlot}-attacker-queue`),
    revealedCard: publicState.combat.revealedCard,
    defenderPool: isOwnAttacker
      ? placeholderCards(remainingDefenderCount, `${ownSlot}-defender-pool`)
      : (ownHand.pending_defender_pool ?? []).filter((card) => !usedDefenderCardIds.has(card.id)),
    pendingTies: publicState.combat.pendingTies,
    resolvedDuels: publicState.combat.resolvedDuels,
  }
}

/**
 * Combines the room's public state with the calling client's own private
 * hand into a GameState shape consumable by the unmodified lib/game/*
 * functions and by GameBoard. `ownSlot` is always mapped to `state.player`
 * ("this browser") and the other slot to `state.npc` ("the opponent") —
 * see the naming note in roomSync.test.ts for why lib/game/*'s
 * player/npc vocabulary is reused structurally rather than forked.
 */
export function buildGameStateView(
  publicState: PublicState,
  ownSlot: PlayerSlot,
  ownHand: PlayerHandRow,
  attackerSlot: PlayerSlot | undefined = undefined,
  roomWinner: PlayerSlot | null = null,
): GameState {
  const opponentSlot = OTHER_SLOT[ownSlot]
  const attackerSide: Side = attackerSlot === ownSlot ? 'player' : 'npc'
  const mappedPhase = publicState.phase === 'round-summary' ? 'combat' : publicState.phase
  const winner: Side | null = roomWinner === null ? null : roomWinner === ownSlot ? 'player' : 'npc'

  return {
    player: buildOwnArmy(ownHand),
    npc: buildOpponentArmy(publicState, opponentSlot),
    // PvP has no difficulty/redo concept; these two fields exist only
    // because GameState requires them structurally (redo is Easy-only
    // single-player, never true in PvP per the spec's "PvP Ace Guarantee").
    difficulty: 'normal',
    roundRedoAvailable: false,
    roundStartSnapshot: null,
    attackerSide,
    phase: mappedPhase,
    combat: buildCombatView(publicState, ownSlot, ownHand, attackerSlot),
    winner,
  }
}

export type VersionGuardResult =
  | { ok: true }
  | { ok: false; reason: 'version-conflict' }
  | { ok: false; reason: 'network-error'; message: string }

/**
 * Generic wrapper for the `WHERE version = expected` optimistic-concurrency
 * pattern described in the spec's Architecture Overview: `update` is
 * expected to perform a Supabase `.update(...).eq('version', expectedVersion)`
 * and resolve with how many rows it actually affected (0 means someone
 * else wrote first). Callers (the hook in Chunk 3) decide how to react to
 * a conflict (refetch + reconcile, or discard as a harmless no-op).
 */
export async function writeWithVersionGuard(
  update: (expectedVersion: number) => Promise<{ affectedRows: number }>,
  expectedVersion: number,
): Promise<VersionGuardResult> {
  try {
    const result = await update(expectedVersion)
    return result.affectedRows > 0 ? { ok: true } : { ok: false, reason: 'version-conflict' }
  } catch (error) {
    return { ok: false, reason: 'network-error', message: error instanceof Error ? error.message : 'unknown error' }
  }
}
