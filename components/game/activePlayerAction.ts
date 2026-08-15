import type { GamePhase } from '@/lib/game/types'

export type ActivePlayerAction =
  | 'difficulty-picker'
  | 'player-hand-selector'
  | 'defender-pool'
  | 'reveal-next'
  | 'round-result'
  | 'game-over'

export interface ActivePlayerActionContext {
  isDifficultyPickerOpen: boolean
  roundResultVisible: boolean
  phase: GamePhase
  isDefenderHuman: boolean
  selectionRequiredCount: number
  hasRevealedCard: boolean
  canRevealNext: boolean
}

export function getActivePlayerAction({
  isDifficultyPickerOpen,
  roundResultVisible,
  phase,
  isDefenderHuman,
  selectionRequiredCount,
  hasRevealedCard,
  canRevealNext,
}: ActivePlayerActionContext): ActivePlayerAction | null {
  if (isDifficultyPickerOpen) {
    return 'difficulty-picker'
  }

  if (roundResultVisible) {
    return 'round-result'
  }

  if (phase === 'selecting' && isDefenderHuman && selectionRequiredCount > 0) {
    return 'player-hand-selector'
  }

  if (phase === 'combat' && isDefenderHuman && hasRevealedCard) {
    return 'defender-pool'
  }

  if (phase === 'combat' && isDefenderHuman && canRevealNext) {
    return 'reveal-next'
  }

  if (phase === 'game-over') {
    return 'game-over'
  }

  return null
}
