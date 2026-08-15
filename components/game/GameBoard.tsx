'use client'

import type { Army, Card, GamePhase, ResolvedDuel, Role } from '@/lib/game/types'
import type { PendingDuelRedo } from '@/lib/game/types'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ActionHighlight } from './ActionHighlight'
import { BattleSlots } from './BattleSlots'
import { PlayerHandSelector } from './PlayerHandSelector'
import { RestAreaStrip } from './RestAreaStrip'

interface RoundResultSummary {
  capturedCards: Card[]
  lostCards: Card[]
  endsGame: boolean
}

interface GameBoardProps {
  playerArmy: Army
  opponentArmy: Army
  attackerQueueCount: number
  revealedCard: Card | null
  defenderPool: Card[]
  resolvedDuels: ResolvedDuel[]
  pendingDuelRedo?: PendingDuelRedo | null
  selectionAvailableCards: Card[]
  selectionRequiredCount: number
  isDefenderHuman: boolean
  playerRole: Role
  phase: GamePhase
  playerName?: string
  opponentName?: string
  roundLabel?: string
  phaseLabel?: string
  statusMessage?: string
  difficultyLabel?: string
  roundResult?: RoundResultSummary | null
  onSelectDefenderCard?: (cardId: string) => void
  onConfirmSelection?: (selectedCardIds: string[]) => void
  onRevealNext?: () => void
  onRedoPendingDuel?: () => void
  onSkipPendingDuelRedo?: () => void
  onDismissRoundResult?: () => void
  canRevealNext?: boolean
  highlightPlayerHandSelector?: boolean
  highlightDefenderPool?: boolean
  highlightRevealNext?: boolean
  highlightPendingDuelRedo?: boolean
  highlightRoundResult?: boolean
}

const suitSymbols: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

function formatCardLabel(card: Card): string {
  return `${card.rank}${suitSymbols[card.suit]}`
}

export function GameBoard({
  playerArmy,
  opponentArmy,
  attackerQueueCount,
  revealedCard,
  defenderPool,
  resolvedDuels,
  pendingDuelRedo = null,
  selectionAvailableCards,
  selectionRequiredCount,
  isDefenderHuman,
  playerRole,
  phase,
  playerName = 'Your Army',
  opponentName = 'Marshal Automaton',
  roundLabel = 'Round 4',
  phaseLabel = 'Combat preview',
  statusMessage = 'The defender answers each revealed attacker one duel at a time.',
  difficultyLabel = 'Easy / Lehká',
  roundResult = null,
  onSelectDefenderCard,
  onConfirmSelection,
  onRevealNext,
  onRedoPendingDuel,
  onSkipPendingDuelRedo,
  onDismissRoundResult,
  canRevealNext = false,
  highlightPlayerHandSelector = false,
  highlightDefenderPool = false,
  highlightRevealNext = false,
  highlightPendingDuelRedo = false,
  highlightRoundResult = false,
}: GameBoardProps) {
  const { t } = useLanguage()
  const opponentRole = playerRole === 'attacker' ? 'defender' : 'attacker'
  const showSelectionPanel = phase === 'selecting' && isDefenderHuman && selectionRequiredCount > 0

  return (
    <main className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top,_rgba(101,126,80,0.18),_transparent_24%),radial-gradient(circle_at_bottom,_rgba(0,0,0,0.2),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-3 pb-6 pt-24 text-military-paper sm:px-5 sm:pt-28 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 sm:gap-5">
        <header className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(135deg,rgba(10,20,13,0.78),rgba(37,50,39,0.92))] p-4 shadow-2xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-military-gold">
                {t((messages) => messages.app.title)}
              </p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl lg:text-4xl">{t((messages) => messages.app.subtitle)}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-military-paper/78 sm:text-base">{statusMessage}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.25em] text-military-gold">
                  {roundLabel}
                </div>
                <div className="mt-1 text-base font-semibold sm:text-lg">{phaseLabel}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.25em] text-military-gold">
                  {t((messages) => messages.board.playerRole)}
                </div>
                <div className="mt-1 text-base font-semibold capitalize sm:text-lg">{t((messages) => messages.roles[playerRole])}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 px-4 py-3 sm:col-span-2">
                <div className="text-xs uppercase tracking-[0.25em] text-military-gold">Difficulty / Obtížnost</div>
                <div className="mt-1 text-base font-semibold sm:text-lg">{difficultyLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0 rounded-[2rem] border border-military-paper/10 bg-black/10 p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-military-gold">
                  {t((messages) => messages.armies.opponentCommand)}
                </p>
                <h2 className="text-xl font-semibold sm:text-2xl">{opponentName}</h2>
              </div>
              <span className="rounded-full border border-military-paper/15 px-3 py-1 text-xs uppercase tracking-[0.2em] text-military-paper/70">
                {t((messages) => messages.roles[opponentRole])}
              </span>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">{t((messages) => messages.armies.available)}</div>
                <div className="mt-1 text-xl font-semibold sm:text-2xl">{opponentArmy.available.length}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">{t((messages) => messages.armies.resting)}</div>
                <div className="mt-1 text-xl font-semibold sm:text-2xl">{opponentArmy.resting.length}</div>
              </div>
            </div>
            <RestAreaStrip
              label={t((messages) => messages.armies.restArea(opponentName))}
              restingCards={opponentArmy.resting}
            />
          </div>

          <BattleSlots
            attackerQueueCount={attackerQueueCount}
            revealedCard={revealedCard}
            defenderPool={defenderPool}
            resolvedDuels={resolvedDuels}
            pendingDuelRedo={pendingDuelRedo}
            onSelectDefenderCard={onSelectDefenderCard}
            onRevealNext={onRevealNext}
            onRedoPendingDuel={onRedoPendingDuel}
            onSkipPendingDuelRedo={onSkipPendingDuelRedo}
            canRevealNext={canRevealNext}
            isDefenderHuman={isDefenderHuman}
            phase={phase}
            isRoundResultVisible={Boolean(roundResult)}
            highlightDefenderPool={highlightDefenderPool}
            highlightRevealNext={highlightRevealNext}
            highlightPendingDuelRedo={highlightPendingDuelRedo}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          {showSelectionPanel ? (
            <PlayerHandSelector
              availableCards={selectionAvailableCards}
              requiredCount={selectionRequiredCount}
              onConfirm={onConfirmSelection ?? (() => undefined)}
              highlighted={highlightPlayerHandSelector}
            />
          ) : (
            <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(239,230,207,0.08),rgba(0,0,0,0.12))] p-4 sm:p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-military-gold">{t((messages) => messages.board.fieldOrders)}</p>
              <h2 className="mt-2 text-xl font-semibold text-military-paper sm:text-2xl">{t((messages) => messages.board.commandOverview)}</h2>
              <p className="mt-3 text-sm leading-6 text-military-paper/78">{statusMessage}</p>
              <div className="mt-5 rounded-2xl border border-military-paper/15 bg-black/15 px-4 py-4 text-sm leading-6 text-military-paper/72">
                {phase === 'game-over'
                  ? t((messages) => messages.board.gameOverOverview)
                  : isDefenderHuman
                    ? t((messages) => messages.board.defenderOverview)
                    : t((messages) => messages.board.npcOverview)}
              </div>
            </section>
          )}

          <div className="min-w-0 space-y-4 rounded-[2rem] border border-military-paper/10 bg-black/10 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-military-gold">
                  {t((messages) => messages.armies.playerCommand)}
                </p>
                <h2 className="text-xl font-semibold sm:text-2xl">{playerName}</h2>
              </div>
              <span className="rounded-full border border-military-paper/15 px-3 py-1 text-xs uppercase tracking-[0.2em] text-military-paper/70">
                {t((messages) => messages.roles[playerRole])}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">{t((messages) => messages.armies.available)}</div>
                <div className="mt-1 text-xl font-semibold sm:text-2xl">{playerArmy.available.length}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">{t((messages) => messages.armies.resting)}</div>
                <div className="mt-1 text-xl font-semibold sm:text-2xl">{playerArmy.resting.length}</div>
              </div>
            </div>

            <RestAreaStrip label={t((messages) => messages.armies.restArea(playerName))} restingCards={playerArmy.resting} />
          </div>
        </section>
      </div>

      {roundResult ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 px-3 py-6 backdrop-blur-sm sm:px-5 lg:px-8">
          <ActionHighlight
            active={highlightRoundResult}
            className="max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-hidden rounded-[2rem] border border-[#d3b26d]"
          >
            <section className="max-h-[calc(100vh-3rem)] w-full overflow-x-hidden overflow-y-auto bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-5 text-military-paper shadow-2xl sm:p-6">
              <p className="text-xs uppercase tracking-[0.35em] text-military-gold">{t((messages) => messages.board.roundResult)}</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{t((messages) => messages.board.reviewBattle)}</h2>
              <p className="mt-2 text-sm leading-6 text-military-paper/78">
                {t((messages) => messages.board.roundSettled)}
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="min-w-0 rounded-3xl border border-emerald-500/20 bg-emerald-950/25 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">
                    {t((messages) => messages.board.youCaptured)}
                  </h3>
                  {roundResult.capturedCards.length > 0 ? (
                    <div className="mt-3 flex max-w-full flex-wrap gap-2">
                      {roundResult.capturedCards.map((card) => (
                        <span
                          key={`captured-${card.id}`}
                          className="rounded-full border border-emerald-300/30 bg-emerald-200/10 px-3 py-1 text-sm font-semibold text-emerald-100"
                        >
                          {formatCardLabel(card)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-emerald-100/70">{t((messages) => messages.board.noCapturedCards)}</p>
                  )}
                </div>

                <div className="min-w-0 rounded-3xl border border-amber-500/20 bg-amber-950/25 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">
                    {t((messages) => messages.board.youLost)}
                  </h3>
                  {roundResult.lostCards.length > 0 ? (
                    <div className="mt-3 flex max-w-full flex-wrap gap-2">
                      {roundResult.lostCards.map((card) => (
                        <span
                          key={`lost-${card.id}`}
                          className="rounded-full border border-amber-300/30 bg-amber-200/10 px-3 py-1 text-sm font-semibold text-amber-100"
                        >
                          {formatCardLabel(card)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-amber-100/70">{t((messages) => messages.board.noLostCards)}</p>
                  )}
                </div>
              </div>

              {roundResult.endsGame ? (
                <div className="mt-5 rounded-3xl border border-military-gold/30 bg-black/15 px-4 py-4 text-sm leading-6 text-military-paper/80">
                  {t((messages) => messages.board.campaignEndingNotice)}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={onDismissRoundResult}
                  className="min-h-11 rounded-full border border-[#d3b26d] bg-[#d1ac56] px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-[#263225] transition hover:bg-[#dfbd6f]"
                >
                  {t((messages) => messages.board.continue)}
                </button>
              </div>
            </section>
          </ActionHighlight>
        </div>
      ) : null}
    </main>
  )
}
