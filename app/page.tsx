'use client'

import { GameBoard } from '@/components/game/GameBoard'
import { useGameState } from '@/hooks/useGameState'
import { computeSlotCount } from '@/lib/game/state'

function getPhaseLabel(phase: string): string {
  if (phase === 'selecting') {
    return 'Selection phase'
  }

  if (phase === 'combat') {
    return 'Combat in progress'
  }

  if (phase === 'game-over') {
    return 'Campaign complete'
  }

  return 'Battle update'
}

export default function HomePage() {
  const { state, actions } = useGameState()
  const totalCards = state.player.available.length + state.player.resting.length + state.npc.available.length + state.npc.resting.length

  if (totalCards === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="rounded-[2rem] border border-[#9b7b3d] bg-black/20 px-6 py-5 text-sm uppercase tracking-[0.28em] text-military-gold">
          Preparing the battlefield...
        </div>
      </main>
    )
  }

  const playerRole = state.attackerSide === 'player' ? 'attacker' : 'defender'
  const isDefenderHuman = state.attackerSide === 'npc'
  const selectionRequiredCount = state.phase === 'selecting' ? computeSlotCount(state) : 0
  const combat = state.combat
  const statusMessage =
    state.phase === 'game-over'
      ? `${state.winner === 'player' ? 'Your army' : 'Marshal Automaton'} controls the field.`
      : state.phase === 'selecting'
        ? isDefenderHuman
          ? selectionRequiredCount > 0
            ? `Select ${selectionRequiredCount} defender card${selectionRequiredCount === 1 ? '' : 's'} from your hand while the NPC prepares a hidden attack.`
            : 'No soldiers are ready on one side, so the round will be skipped while resting units recover.'
          : 'Your army attacks this round. The NPC is automatically choosing its defending line.'
        : isDefenderHuman
          ? combat?.revealedCard
            ? 'A hostile regiment is revealed. Choose which defender from your committed pool will answer it.'
            : combat?.attackerQueue.length
              ? 'Reveal the next hidden attacker when you are ready.'
              : 'All cards are resolved. Advance into the next round.'
          : combat?.revealedCard
            ? 'The NPC is choosing its reply to your revealed attack.'
            : combat?.attackerQueue.length
              ? 'Your attacking queue is ready. The next attacker will be revealed automatically.'
              : 'The round is resolved. The campaign will advance automatically.'

  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-0 z-10 mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 pt-3 sm:px-5 lg:px-8">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={actions.startNewGame}
            className="min-h-11 rounded-full border border-military-paper/20 bg-black/20 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-paper transition hover:bg-black/35"
          >
            New Game
          </button>
        </div>

        {state.phase === 'game-over' ? (
          <section className="rounded-[1.5rem] border border-[#d3b26d] bg-[#f0e2ba]/95 px-5 py-4 text-[#2d2414] shadow-xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#7a5c22]">Game over</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {state.winner === 'player' ? 'You win the campaign!' : 'Marshal Automaton wins the campaign!'}
            </h2>
          </section>
        ) : null}
      </div>

      <GameBoard
        playerArmy={state.player}
        opponentArmy={state.npc}
        attackerQueueCount={combat?.attackerQueue.length ?? 0}
        revealedCard={combat?.revealedCard ?? null}
        defenderPool={combat?.defenderPool ?? []}
        resolvedDuels={combat?.resolvedDuels ?? []}
        selectionAvailableCards={state.player.available}
        selectionRequiredCount={selectionRequiredCount}
        isDefenderHuman={isDefenderHuman}
        playerRole={playerRole}
        phase={state.phase}
        playerName="Your Army"
        opponentName="Marshal Automaton"
        roundLabel={state.attackerSide === 'player' ? 'Player attack' : 'NPC attack'}
        phaseLabel={getPhaseLabel(state.phase)}
        statusMessage={statusMessage}
        onSelectDefenderCard={actions.selectDefenderCard}
        onConfirmSelection={actions.confirmDefenderSelection}
        onRevealNext={actions.revealNextAttacker}
        onAdvanceRound={actions.advanceRound}
        canRevealNext={
          state.phase === 'combat' &&
          isDefenderHuman &&
          !combat?.revealedCard &&
          Boolean(combat?.attackerQueue.length)
        }
        canAdvanceRound={
          state.phase === 'combat' &&
          isDefenderHuman &&
          !combat?.revealedCard &&
          (combat?.attackerQueue.length ?? 0) === 0
        }
      />
    </div>
  )
}
