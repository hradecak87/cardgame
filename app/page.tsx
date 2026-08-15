'use client'

import { GameBoard } from '@/components/game/GameBoard'
import { useGameState } from '@/hooks/useGameState'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { computeSlotCount } from '@/lib/game/state'

export default function HomePage() {
  const { state, roundResult, actions } = useGameState()
  const { language, setLanguage, t } = useLanguage()
  const totalCards = state.player.available.length + state.player.resting.length + state.npc.available.length + state.npc.resting.length

  if (totalCards === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="rounded-[2rem] border border-[#9b7b3d] bg-black/20 px-6 py-5 text-sm uppercase tracking-[0.28em] text-military-gold">
          {t((messages) => messages.app.preparingBattlefield)}
        </div>
      </main>
    )
  }

  const playerRole = state.attackerSide === 'player' ? 'attacker' : 'defender'
  const isDefenderHuman = state.attackerSide === 'npc'
  const selectionRequiredCount = state.phase === 'selecting' ? computeSlotCount(state) : 0
  const combat = state.combat
  const statusMessage =
    roundResult
      ? t((messages) => messages.app.status.roundResult)
      : state.phase === 'game-over'
      ? t((messages) => messages.app.status.gameOver(state.winner))
      : state.phase === 'selecting'
        ? isDefenderHuman
          ? selectionRequiredCount > 0
            ? t((messages) => messages.app.status.selectingHumanDefender(selectionRequiredCount))
            : t((messages) => messages.app.status.selectingSkipRound)
          : t((messages) => messages.app.status.selectingNpcDefender)
        : isDefenderHuman
          ? combat?.revealedCard
            ? t((messages) => messages.app.status.combatChooseDefender)
            : combat?.attackerQueue.length
              ? t((messages) => messages.app.status.combatRevealNext)
              : t((messages) => messages.app.status.combatResolving)
          : combat?.revealedCard
            ? t((messages) => messages.app.status.combatNpcReply)
            : combat?.attackerQueue.length
              ? t((messages) => messages.app.status.combatNpcAutoReveal)
              : t((messages) => messages.app.status.combatReviewFinalDuel)

  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-0 z-10 mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 pt-3 sm:px-5 lg:px-8">
        <div className="flex justify-end gap-3">
          <div className="flex items-center gap-1 rounded-full border border-military-paper/20 bg-black/30 p-1 text-xs font-bold uppercase tracking-[0.18em] text-military-paper shadow-lg">
            <span className="px-2 text-military-paper/70">{t((messages) => messages.languageSwitcher.label)}</span>
            {(['en', 'cs'] as const).map((option) => {
              const label =
                option === 'en'
                  ? t((messages) => messages.languageSwitcher.english)
                  : t((messages) => messages.languageSwitcher.czech)

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLanguage(option)}
                  aria-pressed={language === option}
                  className={[
                    'min-h-9 rounded-full px-3 py-2 transition',
                    language === option ? 'bg-[#d1ac56] text-[#263225]' : 'text-military-paper/85 hover:bg-black/25',
                  ].join(' ')}
                >
                  {option.toUpperCase()}
                  <span className="sr-only">{label}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={actions.startNewGame}
            className="min-h-11 rounded-full border border-military-paper/20 bg-black/30 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-paper shadow-lg transition hover:bg-black/40"
          >
            {t((messages) => messages.app.newGame)}
          </button>
        </div>

        {state.phase === 'game-over' ? (
          <section className="rounded-[1.5rem] border border-[#d3b26d] bg-[#f0e2ba]/95 px-5 py-4 text-[#2d2414] shadow-xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#7a5c22]">{t((messages) => messages.app.gameOver)}</p>
            <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
              {state.winner === 'player'
                ? t((messages) => messages.app.playerWinsCampaign)
                : t((messages) => messages.app.npcWinsCampaign)}
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
        playerName={t((messages) => messages.app.playerArmyName)}
        opponentName={t((messages) => messages.app.opponentName)}
        roundLabel={t((messages) => messages.app.roundLabel(state.attackerSide))}
        phaseLabel={t((messages) => messages.app.phaseLabel(state.phase, Boolean(roundResult)))}
        statusMessage={statusMessage}
        roundResult={
          roundResult
            ? {
                capturedCards: roundResult.capturedCards,
                lostCards: roundResult.lostCards,
                endsGame: roundResult.nextState.phase === 'game-over',
              }
            : null
        }
        onSelectDefenderCard={actions.selectDefenderCard}
        onConfirmSelection={actions.confirmDefenderSelection}
        onRevealNext={actions.revealNextAttacker}
        onDismissRoundResult={actions.dismissRoundResult}
        canRevealNext={
          !roundResult &&
          state.phase === 'combat' &&
          isDefenderHuman &&
          !combat?.revealedCard &&
          Boolean(combat?.attackerQueue.length)
        }
      />
    </div>
  )
}
