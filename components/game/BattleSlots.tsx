'use client'

import { motion } from 'framer-motion'
import type { Card, GamePhase, ResolvedDuel } from '@/lib/game/types'
import { PlayingCard } from './PlayingCard'

interface BattleSlotsProps {
  attackerQueueCount: number
  revealedCard: Card | null
  defenderPool: Card[]
  resolvedDuels: ResolvedDuel[]
  onSelectDefenderCard?: (cardId: string) => void
  onRevealNext?: () => void
  onAdvanceRound?: () => void
  canRevealNext: boolean
  canAdvanceRound: boolean
  isDefenderHuman: boolean
  phase: GamePhase
}

export function BattleSlots({
  attackerQueueCount,
  revealedCard,
  defenderPool,
  resolvedDuels,
  onSelectDefenderCard,
  onRevealNext,
  onAdvanceRound,
  canRevealNext,
  canAdvanceRound,
  isDefenderHuman,
  phase,
}: BattleSlotsProps) {
  const defenderCanAct = isDefenderHuman && Boolean(revealedCard) && Boolean(onSelectDefenderCard)
  const showRevealButton = canRevealNext && typeof onRevealNext === 'function'
  const showAdvanceButton = canAdvanceRound && typeof onAdvanceRound === 'function'
  const battlefieldMessage = defenderCanAct
    ? 'Choose a defender card to answer the revealed attacker.'
    : showRevealButton
      ? 'Reveal the next hidden attacker to continue the battle.'
      : showAdvanceButton
        ? 'All clashes are settled. Advance to the next round.'
        : phase === 'selecting'
          ? 'The armies are assembling their lines for the next clash.'
          : isDefenderHuman
            ? 'Waiting for the next attacker reveal.'
            : 'NPC is defending automatically.'

  return (
    <section className="rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(35,49,39,0.92),rgba(20,31,23,0.96))] p-4 shadow-2xl">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-military-gold">Battlefield</p>
          <h2 className="text-xl font-semibold text-military-paper">Active duel line</h2>
        </div>
        <p className="text-sm text-military-paper/75">{battlefieldMessage}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-3xl border border-military-paper/10 bg-black/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-military-paper/90">
              Attacker queue
            </h3>
            <span className="rounded-full border border-military-gold/60 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-military-gold">
              {attackerQueueCount} remaining
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-dashed border-military-paper/15 bg-black/10 p-4">
              <p className="mb-4 text-xs uppercase tracking-[0.24em] text-military-paper/60">
                Hidden column
              </p>
              <div className="relative mx-auto h-28 w-24">
                {Array.from({ length: Math.max(1, Math.min(attackerQueueCount, 3)) }).map((_, index) => (
                  <motion.div
                    key={`queue-${index}`}
                    initial={{ opacity: 0, x: -8 + index * 4, y: 8 + index * 6 }}
                    animate={{ opacity: 1, x: index * 6, y: index * 6 }}
                    className="absolute left-0 top-0"
                  >
                    <PlayingCard
                      card={{
                        id: `queue-back-${index}`,
                        rank: 'A',
                        suit: 'spades',
                        power: 8,
                      }}
                      faceDown
                      size="sm"
                    />
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-military-paper/15 bg-black/10 p-4">
              <p className="mb-4 text-xs uppercase tracking-[0.24em] text-military-paper/60">
                Revealed attacker
              </p>
              <div className="flex min-h-32 items-center justify-center">
                {revealedCard ? (
                  <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <PlayingCard card={revealedCard} size="lg" />
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-military-paper/20 px-6 py-8 text-center text-sm text-military-paper/60">
                    <div>No attacker is revealed right now.</div>
                    {showRevealButton ? (
                      <button
                        type="button"
                        onClick={onRevealNext}
                        className="min-h-11 rounded-full border border-[#d3b26d] bg-[#d1ac56] px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-[#263225] transition hover:bg-[#dfbd6f]"
                      >
                        Reveal next attacker
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-military-paper/10 bg-black/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-military-paper/90">
                Defender pool
              </h3>
              <span className="text-xs uppercase tracking-[0.2em] text-military-paper/60">
                {defenderCanAct ? 'Tap a card to deploy' : 'Cards in reserve'}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              {defenderPool.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-military-paper/20 px-4 py-5 text-sm text-military-paper/60">
                  No defender cards remain in the pool.
                </div>
              ) : (
                defenderPool.map((card) => (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <PlayingCard
                      card={card}
                      size="md"
                      onClick={
                        defenderCanAct ? () => onSelectDefenderCard?.(card.id) : undefined
                      }
                    />
                  </motion.div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-military-paper/10 bg-black/10 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-military-paper/90">
              Resolved duels
            </h3>

            {resolvedDuels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-military-paper/20 px-4 py-5 text-sm text-military-paper/60">
                The field is still waiting for its first clash.
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {resolvedDuels.map((duel, index) => {
                  const defenderWon = duel.winner === 'defender'
                  const { attackerCard, defenderCard } = duel.duel

                  return (
                    <motion.div
                      key={`${attackerCard.id}-${defenderCard.id}-${index}`}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-2xl border border-military-paper/10 bg-[#19261c] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <PlayingCard card={attackerCard} size="sm" />
                        <span className="text-xl text-military-gold">⚔️</span>
                        <PlayingCard card={defenderCard} size="sm" />
                      </div>
                      <div
                        className={[
                          'mt-2 rounded-full px-3 py-1 text-center text-[10px] font-bold uppercase tracking-[0.22em]',
                          defenderWon
                            ? 'bg-emerald-950/80 text-emerald-200'
                            : 'bg-amber-950/80 text-amber-200',
                        ].join(' ')}
                      >
                        {defenderWon ? 'Defender held the line' : 'Attacker broke through'}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {showAdvanceButton ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onAdvanceRound}
                  className="min-h-11 rounded-full border border-[#d3b26d] bg-[#d1ac56] px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-[#263225] transition hover:bg-[#dfbd6f]"
                >
                  Advance round
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
