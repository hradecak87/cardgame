'use client'

import { useState } from 'react'
import { ActionHighlight } from '@/components/game/ActionHighlight'
import { GameBoard } from '@/components/game/GameBoard'
import { getActivePlayerAction } from '@/components/game/activePlayerAction'
import { MainMenu } from '@/components/multiplayer/MainMenu'
import { CreateRoomScreen } from '@/components/multiplayer/CreateRoomScreen'
import { JoinRoomScreen } from '@/components/multiplayer/JoinRoomScreen'
import { ConnectionStatusBanner } from '@/components/multiplayer/ConnectionStatusBanner'
import { useGameState } from '@/hooks/useGameState'
import { useMultiplayerGameState } from '@/hooks/useMultiplayerGameState'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { computeSlotCount } from '@/lib/game/state'
import { buildRoundResultCards } from '@/lib/game/roundResult'
import type { Difficulty } from '@/lib/game/types'

type GameMode = 'menu' | 'single-player' | 'multiplayer-create' | 'multiplayer-join' | 'multiplayer-game'

const DIFFICULTY_OPTIONS: Array<{
  value: Difficulty
  label: string
  summary: string
}> = [
  {
    value: 'easy',
    label: 'Easy / Lehká',
    summary: '2 aces for the player, 2-round rest, one lifetime round redo.',
  },
  {
    value: 'normal',
    label: 'Normal / Normální',
    summary: '1 guaranteed ace, 50% chance for a second, standard 2-round rest.',
  },
  {
    value: 'expert',
    label: 'Expert / Expertní',
    summary: 'Only 1 player ace and 3-round rest for captured soldiers.',
  },
]

function getDifficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label ?? 'Easy / Lehká'
}

function DifficultyPicker({
  selectedDifficulty,
  onStart,
  onCancel,
  showCancel,
  highlighted = false,
}: {
  selectedDifficulty: Difficulty
  onStart: (difficulty: Difficulty) => void
  onCancel?: () => void
  showCancel: boolean
  highlighted?: boolean
}) {
  return (
    <ActionHighlight
      active={highlighted}
      className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d]"
    >
      <section className="max-w-full bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-6 text-military-paper shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-military-gold">New campaign / Nová hra</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Choose difficulty / Zvolte obtížnost</h1>
        <p className="mt-3 text-sm leading-6 text-military-paper/78">
          Pick the next opponent advantage before the campaign begins.
        </p>

        <div className="mt-6 grid gap-4">
          {DIFFICULTY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStart(option.value)}
              className={[
                'rounded-[1.5rem] border p-5 text-left transition',
                selectedDifficulty === option.value
                  ? 'border-[#d3b26d] bg-[#d1ac56]/10 shadow-lg'
                  : 'border-military-paper/15 bg-black/15 hover:bg-black/25',
              ].join(' ')}
            >
              <div className="text-lg font-semibold">{option.label}</div>
              <div className="mt-2 text-sm leading-6 text-military-paper/78">{option.summary}</div>
            </button>
          ))}
        </div>

        {showCancel ? (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-full border border-military-paper/20 bg-black/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-paper transition hover:bg-black/35"
            >
              Keep current game / Nechat současnou hru
            </button>
          </div>
        ) : null}
      </section>
    </ActionHighlight>
  )
}

export default function HomePage() {
  const { state, roundResult, selectedDifficulty, isDifficultyPickerOpen, isHydrated, actions } = useGameState()
  const multiplayerState = useMultiplayerGameState()
  const { language, setLanguage, t } = useLanguage()
  const [gameMode, setGameMode] = useState<GameMode>('menu')

  const totalCards = state.player.available.length + state.player.resting.length + state.npc.available.length + state.npc.resting.length
  const playerRole = state.attackerSide === 'player' ? 'attacker' : 'defender'
  const isDefenderHuman = state.attackerSide === 'npc'
  const selectionRequiredCount = state.phase === 'selecting' ? computeSlotCount(state) : 0
  const combat = state.combat
  const canRevealNext =
    !roundResult &&
    state.phase === 'combat' &&
    isDefenderHuman &&
    !combat?.revealedCard &&
    Boolean(combat?.attackerQueue.length)
  const activePlayerAction = getActivePlayerAction({
    isDifficultyPickerOpen,
    roundResultVisible: Boolean(roundResult),
    phase: state.phase,
    isDefenderHuman,
    selectionRequiredCount,
    hasRevealedCard: Boolean(combat?.revealedCard),
    canRevealNext,
  })

  // Transition to multiplayer-game when room is playing
  if ((gameMode === 'multiplayer-create' || gameMode === 'multiplayer-join') && multiplayerState.roomStatus === 'playing') {
    setGameMode('multiplayer-game')
  }

  if (!isHydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="rounded-[2rem] border border-[#9b7b3d] bg-black/20 px-6 py-5 text-sm uppercase tracking-[0.28em] text-military-gold">
          {t((messages) => messages.app.preparingBattlefield)}
        </div>
      </main>
    )
  }

  // Menu mode
  if (gameMode === 'menu') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="w-full max-w-3xl">
          <MainMenu
            onSelectSinglePlayer={() => setGameMode('single-player')}
            onSelectMultiplayer={() => setGameMode('multiplayer-create')}
          />
        </div>
      </main>
    )
  }

  // Multiplayer create room mode
  if (gameMode === 'multiplayer-create') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="w-full max-w-3xl">
          <CreateRoomScreen
            onCreateRoom={async (nickname) => {
              const result = await multiplayerState.actions.createRoom(nickname)
              if (!result.ok) {
                console.error('Failed to create room:', result.reason)
              }
            }}
            roomCode={multiplayerState.roomCode}
            roomStatus={multiplayerState.roomStatus}
          />
        </div>
      </main>
    )
  }

  // Multiplayer join room mode  
  if (gameMode === 'multiplayer-join') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="w-full max-w-3xl">
          <JoinRoomScreen
            onJoinRoom={async (code, nickname) => {
              const result = await multiplayerState.actions.joinRoom(code, nickname)
              if (result.ok) {
                return { ok: true }
              } else {
                return { ok: false, reason: result.reason || 'Failed to join room' }
              }
            }}
          />
        </div>
      </main>
    )
  }

  // Single-player mode
  if (gameMode === 'single-player' && totalCards === 0 && isDifficultyPickerOpen) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(76,98,71,0.28),_transparent_28%),linear-gradient(180deg,#233127_0%,#17211a_100%)] px-6 text-military-paper">
        <div className="w-full max-w-3xl">
          <DifficultyPicker
            selectedDifficulty={selectedDifficulty}
            onStart={actions.startNewGame}
            showCancel={false}
            highlighted={activePlayerAction === 'difficulty-picker'}
          />
        </div>
      </main>
    )
  }

  // Multiplayer game mode
  if (gameMode === 'multiplayer-game' && multiplayerState.state) {
    const mpState = multiplayerState.state
    const mpRoundResult =
      multiplayerState.publicPhase === 'round-summary' && mpState.combat
        ? {
            capturedCards: buildRoundResultCards(mpState).capturedCards,
            lostCards: buildRoundResultCards(mpState).lostCards,
            canRedoRound: false,
            endsGame: false,
          }
        : null

    // Multiplayer-specific mappings
    const mpIsDefenderHuman = mpState.attackerSide !== 'player'
    const mpSelectionRequiredCount = mpState.phase === 'selecting' ? computeSlotCount(mpState) : 0
    const mpCombat = mpState.combat
    const mpCanRevealNext =
      !mpRoundResult &&
      mpState.phase === 'combat' &&
      mpState.attackerSide === 'player' &&
      !mpCombat?.revealedCard &&
      Boolean(mpCombat?.attackerQueue.length)

    return (
      <div className="relative">
        <div className="absolute left-0 right-0 top-0 z-10 mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 pt-3 sm:px-5 lg:px-8">
          <div className="flex justify-between items-center gap-3">
            <ConnectionStatusBanner
              isPeerConnected={multiplayerState.isPeerConnected}
              message={t((msg) => msg.multiplayer.connectionStatus.peerDisconnected)}
            />
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
              onClick={() => {
                multiplayerState.actions.leaveRoom()
                setGameMode('menu')
              }}
              className="min-h-11 rounded-full border border-military-paper/20 bg-black/30 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-paper shadow-lg transition hover:bg-black/40"
            >
              Back to menu
            </button>
          </div>

          {mpState.phase === 'game-over' ? (
            <ActionHighlight active={false} className="rounded-[1.5rem] border border-[#d3b26d]">
              <section className="bg-[#f0e2ba]/95 px-5 py-4 text-[#2d2414] shadow-xl">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#7a5c22]">{t((messages) => messages.app.gameOver)}</p>
                <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                  {mpState.winner === 'player'
                    ? 'You win!'
                    : 'Your opponent wins!'}
                </h2>
              </section>
            </ActionHighlight>
          ) : null}
        </div>

        <GameBoard
          playerArmy={mpState.player}
          opponentArmy={mpState.npc}
          attackerQueueCount={mpCombat?.attackerQueue.length ?? 0}
          revealedCard={mpCombat?.revealedCard ?? null}
          defenderPool={mpCombat?.defenderPool ?? []}
          resolvedDuels={mpCombat?.resolvedDuels ?? []}
          selectionAvailableCards={mpState.player.available}
          selectionRequiredCount={mpSelectionRequiredCount}
          isDefenderHuman={mpIsDefenderHuman}
          playerRole={mpState.attackerSide === 'player' ? 'attacker' : 'defender'}
          phase={mpState.phase}
          playerName={multiplayerState.ownNickname || 'You'}
          opponentName={multiplayerState.opponentNickname || 'Opponent'}
          roundLabel={`${multiplayerState.ownNickname || 'You'} ${mpState.attackerSide === 'player' ? 'attacks' : 'defends'}`}
          phaseLabel={t((messages) => messages.app.phaseLabel(mpState.phase, Boolean(mpRoundResult)))}
          statusMessage={
            mpRoundResult
              ? t((messages) => messages.app.status.roundResult)
              : mpState.phase === 'game-over'
                ? 'Game over'
                : mpState.phase === 'selecting'
                  ? mpIsDefenderHuman
                    ? `Select ${mpSelectionRequiredCount} defender cards`
                    : 'Opponent is attacking'
                  : mpIsDefenderHuman
                    ? 'Choose a defender'
                    : 'Opponent is defending'
          }
          difficultyLabel="Online"
          roundResult={mpRoundResult}
          onSelectDefenderCard={multiplayerState.actions.selectDefenderCard}
          onConfirmSelection={(cardIds) => multiplayerState.actions.confirmDefenderSelection(cardIds)}
          onRevealNext={multiplayerState.actions.revealNextAttacker}
          onRedoRound={() => {}}
          onDismissRoundResult={multiplayerState.actions.dismissRoundResult}
          canRevealNext={mpCanRevealNext}
          highlightPlayerHandSelector={false}
          highlightDefenderPool={false}
          highlightRevealNext={false}
          highlightRoundResult={Boolean(mpRoundResult)}
        />
      </div>
    )
  }

  // Single-player game mode (default)
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
            onClick={actions.openDifficultyPicker}
            className="min-h-11 rounded-full border border-military-paper/20 bg-black/30 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-paper shadow-lg transition hover:bg-black/40"
          >
            {t((messages) => messages.app.newGame)}
          </button>
        </div>

        {state.phase === 'game-over' ? (
          <ActionHighlight
            active={activePlayerAction === 'game-over'}
            className="rounded-[1.5rem] border border-[#d3b26d]"
          >
            <section className="bg-[#f0e2ba]/95 px-5 py-4 text-[#2d2414] shadow-xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#7a5c22]">{t((messages) => messages.app.gameOver)}</p>
              <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                {state.winner === 'player'
                  ? t((messages) => messages.app.playerWinsCampaign)
                  : t((messages) => messages.app.npcWinsCampaign)}
              </h2>
            </section>
          </ActionHighlight>
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
        difficultyLabel={getDifficultyLabel(state.difficulty)}
        roundResult={
          roundResult
            ? {
                capturedCards: roundResult.capturedCards,
                lostCards: roundResult.lostCards,
                canRedoRound: roundResult.canRedoRound,
                endsGame: roundResult.nextState.phase === 'game-over',
              }
            : null
        }
        onSelectDefenderCard={actions.selectDefenderCard}
        onConfirmSelection={actions.confirmDefenderSelection}
        onRevealNext={actions.revealNextAttacker}
        onRedoRound={actions.redoRound}
        onDismissRoundResult={actions.dismissRoundResult}
        canRevealNext={canRevealNext}
        highlightPlayerHandSelector={activePlayerAction === 'player-hand-selector'}
        highlightDefenderPool={activePlayerAction === 'defender-pool'}
        highlightRevealNext={activePlayerAction === 'reveal-next'}
        highlightRoundResult={activePlayerAction === 'round-result'}
      />

      {isDifficultyPickerOpen && gameMode === 'single-player' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-3 py-6 backdrop-blur-sm sm:px-5 lg:px-8">
          <div className="w-full max-w-3xl">
            <DifficultyPicker
              selectedDifficulty={selectedDifficulty}
              onStart={actions.startNewGame}
              onCancel={actions.closeDifficultyPicker}
              showCancel
              highlighted={activePlayerAction === 'difficulty-picker'}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
