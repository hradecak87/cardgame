'use client'

import { motion } from 'framer-motion'
import type { Card, GamePhase, ResolvedDuel } from '@/lib/game/types'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ActionHighlight } from './ActionHighlight'
import { HiddenCardBack } from './HiddenCardBack'
import { PlayingCard } from './PlayingCard'

interface BattleSlotsProps {
  attackerQueueCount: number
  revealedCard: Card | null
  defenderPool: Card[]
  resolvedDuels: ResolvedDuel[]
  onSelectDefenderCard?: (cardId: string) => void
  onRevealNext?: () => void
  canRevealNext: boolean
  isDefenderHuman: boolean
  phase: GamePhase
  isRoundResultVisible?: boolean
  highlightDefenderPool?: boolean
  highlightRevealNext?: boolean
}

export function BattleSlots({
  attackerQueueCount,
  revealedCard,
  defenderPool,
  resolvedDuels,
  onSelectDefenderCard,
  onRevealNext,
  canRevealNext,
  isDefenderHuman,
  phase,
  isRoundResultVisible = false,
  highlightDefenderPool = false,
  highlightRevealNext = false,
}: BattleSlotsProps) {
  const { t } = useLanguage()
  const defenderCanAct = isDefenderHuman && Boolean(revealedCard) && Boolean(onSelectDefenderCard)
  const showRevealButton = canRevealNext && typeof onRevealNext === 'function'
  const battlefieldMessage = isRoundResultVisible
    ? t((messages) => messages.battleSlots.reviewRoundResult)
    : defenderCanAct
      ? t((messages) => messages.battleSlots.chooseDefender)
      : showRevealButton
        ? t((messages) => messages.battleSlots.revealHiddenAttacker)
        : !revealedCard && attackerQueueCount === 0
          ? t((messages) => messages.battleSlots.preparingRoundResult)
          : phase === 'selecting'
            ? t((messages) => messages.battleSlots.assemblingLines)
            : isDefenderHuman
              ? t((messages) => messages.battleSlots.waitingForReveal)
              : t((messages) => messages.battleSlots.npcDefendingAutomatically)

  return (
    <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(35,49,39,0.94),rgba(18,28,21,0.98))] p-4 shadow-2xl sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-military-gold">{t((messages) => messages.battleSlots.battlefield)}</p>
          <h2 className="text-xl font-semibold text-military-paper sm:text-2xl">{t((messages) => messages.battleSlots.activeDuelLine)}</h2>
        </div>
        <p className="max-w-xl min-w-0 text-sm leading-6 text-military-paper/80">{battlefieldMessage}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 rounded-3xl border border-military-paper/10 bg-black/10 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-military-paper/90">
              {t((messages) => messages.battleSlots.attackerQueue)}
            </h3>
            <span className="rounded-full border border-military-gold/60 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-military-gold">
              {t((messages) => messages.battleSlots.remaining(attackerQueueCount))}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-dashed border-military-paper/15 bg-black/10 p-4">
              <p className="mb-4 text-xs uppercase tracking-[0.24em] text-military-paper/60">
                {t((messages) => messages.battleSlots.hiddenColumn)}
              </p>
              <div className="relative mx-auto h-24 w-20 sm:h-28 sm:w-24">
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
                {t((messages) => messages.battleSlots.revealedAttacker)}
              </p>
              <div className="flex min-h-[9rem] items-center justify-center sm:min-h-[10rem]">
                {revealedCard ? (
                  <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <PlayingCard card={revealedCard} size="lg" />
                  </motion.div>
                ) : (
                  <div className="flex min-h-[9rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-military-paper/20 px-5 py-6 text-center text-sm leading-6 text-military-paper/65">
                    <div>{t((messages) => messages.battleSlots.noRevealedAttacker)}</div>
                    {showRevealButton ? (
                      <ActionHighlight active={highlightRevealNext} className="rounded-full">
                        <button
                          type="button"
                          onClick={onRevealNext}
                          className="min-h-11 rounded-full border border-[#d3b26d] bg-[#d1ac56] px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-[#263225] transition hover:bg-[#dfbd6f]"
                        >
                          {t((messages) => messages.battleSlots.revealNextAttacker)}
                        </button>
                      </ActionHighlight>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <ActionHighlight
            active={highlightDefenderPool}
            className="min-w-0 rounded-3xl border border-military-paper/10"
          >
            <div className="min-w-0 bg-black/10 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-military-paper/90">
                  {t((messages) => messages.battleSlots.defenderPool)}
                </h3>
                <span className="text-xs uppercase tracking-[0.2em] text-military-paper/60">
                  {defenderCanAct
                    ? t((messages) => messages.battleSlots.tapCardToDeploy)
                    : t((messages) => messages.battleSlots.cardsInReserve)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                {defenderPool.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-military-paper/20 px-4 py-5 text-sm text-military-paper/60">
                    {t((messages) => messages.battleSlots.noDefenderCards)}
                  </div>
                ) : (
                  defenderPool.map((card) => (
                    <motion.div
                      key={card.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-full"
                    >
                      {isDefenderHuman ? (
                        <PlayingCard
                          card={card}
                          size="md"
                          onClick={
                            defenderCanAct ? () => onSelectDefenderCard?.(card.id) : undefined
                          }
                        />
                      ) : (
                        // These are count-only placeholders for the
                        // opponent's pool: real identities are private and
                        // must stay hidden. Rendered as a plain static
                        // card back (no 3D flip) to avoid the "rotateY
                        // flip renders mirrored instead of hidden" bug
                        // some mobile browsers/WebViews have with
                        // PlayingCard's faceDown transform.
                        <HiddenCardBack size="md" />
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </ActionHighlight>

          <div className="min-w-0 rounded-3xl border border-military-paper/10 bg-black/10 p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-military-paper/90">
              {t((messages) => messages.battleSlots.resolvedDuels)}
            </h3>

            {resolvedDuels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-military-paper/20 px-4 py-5 text-sm text-military-paper/60">
                {t((messages) => messages.battleSlots.waitingForFirstClash)}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {resolvedDuels.map((duel, index) => {
                  const defenderWon = duel.winner === 'defender'
                  const { attackerCard, defenderCard } = duel.duel

                  return (
                    <motion.div
                      key={`${attackerCard.id}-${defenderCard.id}-${index}`}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="min-w-0 rounded-2xl border border-military-paper/10 bg-[#19261c] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-center gap-2">
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
                        {defenderWon
                          ? t((messages) => messages.battleSlots.defenderHeldLine)
                          : t((messages) => messages.battleSlots.attackerBrokeThrough)}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
