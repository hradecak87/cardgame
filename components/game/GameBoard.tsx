'use client'

import type { Army, Card, GamePhase, ResolvedDuel, Role } from '@/lib/game/types'
import { BattleSlots } from './BattleSlots'
import { PlayerHandSelector } from './PlayerHandSelector'
import { RestAreaStrip } from './RestAreaStrip'

interface GameBoardProps {
  playerArmy: Army
  opponentArmy: Army
  attackerQueueCount: number
  revealedCard: Card | null
  defenderPool: Card[]
  resolvedDuels: ResolvedDuel[]
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
  onSelectDefenderCard?: (cardId: string) => void
  onConfirmSelection?: (selectedCardIds: string[]) => void
  onRevealNext?: () => void
  onAdvanceRound?: () => void
  canRevealNext?: boolean
  canAdvanceRound?: boolean
}

export function GameBoard({
  playerArmy,
  opponentArmy,
  attackerQueueCount,
  revealedCard,
  defenderPool,
  resolvedDuels,
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
  onSelectDefenderCard,
  onConfirmSelection,
  onRevealNext,
  onAdvanceRound,
  canRevealNext = false,
  canAdvanceRound = false,
}: GameBoardProps) {
  const opponentRole = playerRole === 'attacker' ? 'defender' : 'attacker'
  const showSelectionPanel = phase === 'selecting' && isDefenderHuman && selectionRequiredCount > 0

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-3 py-4 text-military-paper sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(135deg,rgba(10,20,13,0.75),rgba(37,50,39,0.9))] p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-military-gold">
                Battle Card Game
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Napoleonic field command table</h1>
              <p className="mt-2 max-w-2xl text-sm text-military-paper/75">{statusMessage}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.25em] text-military-gold">
                  {roundLabel}
                </div>
                <div className="mt-1 text-lg font-semibold">{phaseLabel}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.25em] text-military-gold">
                  Player role
                </div>
                <div className="mt-1 text-lg font-semibold capitalize">{playerRole}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="rounded-[2rem] border border-military-paper/10 bg-black/10 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-military-gold">
                  Opponent command
                </p>
                <h2 className="text-2xl font-semibold">{opponentName}</h2>
              </div>
              <span className="rounded-full border border-military-paper/15 px-3 py-1 text-xs uppercase tracking-[0.2em] text-military-paper/70">
                {opponentRole}
              </span>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">Available</div>
                <div className="mt-1 text-2xl font-semibold">{opponentArmy.available.length}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">Resting</div>
                <div className="mt-1 text-2xl font-semibold">{opponentArmy.resting.length}</div>
              </div>
            </div>
            <RestAreaStrip
              label={`${opponentName} rest area`}
              restingCards={opponentArmy.resting}
            />
          </div>

          <BattleSlots
            attackerQueueCount={attackerQueueCount}
            revealedCard={revealedCard}
            defenderPool={defenderPool}
            resolvedDuels={resolvedDuels}
            onSelectDefenderCard={onSelectDefenderCard}
            onRevealNext={onRevealNext}
            onAdvanceRound={onAdvanceRound}
            canRevealNext={canRevealNext}
            canAdvanceRound={canAdvanceRound}
            isDefenderHuman={isDefenderHuman}
            phase={phase}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          {showSelectionPanel ? (
            <PlayerHandSelector
              availableCards={selectionAvailableCards}
              requiredCount={selectionRequiredCount}
              onConfirm={onConfirmSelection ?? (() => undefined)}
            />
          ) : (
            <section className="rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(239,230,207,0.08),rgba(0,0,0,0.12))] p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-military-gold">Field orders</p>
              <h2 className="mt-2 text-xl font-semibold text-military-paper">Command overview</h2>
              <p className="mt-3 text-sm text-military-paper/75">{statusMessage}</p>
              <div className="mt-5 rounded-2xl border border-military-paper/15 bg-black/15 px-4 py-4 text-sm text-military-paper/70">
                {phase === 'game-over'
                  ? 'The campaign is over. Start a new game to redeploy both armies.'
                  : isDefenderHuman
                    ? 'Your current defender pool is shown on the battlefield. Reveal attackers and answer them one by one.'
                    : 'The NPC will complete its round automatically while you watch the duel line resolve.'}
              </div>
            </section>
          )}

          <div className="space-y-4 rounded-[2rem] border border-military-paper/10 bg-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-military-gold">
                  Player command
                </p>
                <h2 className="text-2xl font-semibold">{playerName}</h2>
              </div>
              <span className="rounded-full border border-military-paper/15 px-3 py-1 text-xs uppercase tracking-[0.2em] text-military-paper/70">
                {playerRole}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">Available</div>
                <div className="mt-1 text-2xl font-semibold">{playerArmy.available.length}</div>
              </div>
              <div className="rounded-2xl border border-military-paper/10 bg-black/15 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-military-gold">Resting</div>
                <div className="mt-1 text-2xl font-semibold">{playerArmy.resting.length}</div>
              </div>
            </div>

            <RestAreaStrip label={`${playerName} rest area`} restingCards={playerArmy.resting} />
          </div>
        </section>
      </div>
    </main>
  )
}
