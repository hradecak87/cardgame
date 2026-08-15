import { getActivePlayerAction } from './activePlayerAction'
import type { GamePhase } from '@/lib/game/types'

function getActiveAction(overrides: Partial<Parameters<typeof getActivePlayerAction>[0]> = {}) {
  return getActivePlayerAction({
    isDifficultyPickerOpen: false,
    roundResultVisible: false,
    pendingDuelRedoVisible: false,
    phase: 'combat',
    isDefenderHuman: false,
    selectionRequiredCount: 0,
    hasRevealedCard: false,
    canRevealNext: false,
    ...overrides,
  })
}

describe('getActivePlayerAction', () => {
  test('highlights the difficulty picker whenever it is open', () => {
    expect(getActiveAction({ isDifficultyPickerOpen: true })).toBe('difficulty-picker')
  })

  test('highlights the hand selector when the human defender must choose cards', () => {
    expect(
      getActiveAction({
        phase: 'selecting',
        isDefenderHuman: true,
        selectionRequiredCount: 2,
      }),
    ).toBe('player-hand-selector')
  })

  test('highlights the defender pool when a revealed attacker is waiting for the player response', () => {
    expect(
      getActiveAction({
        phase: 'combat',
        isDefenderHuman: true,
        hasRevealedCard: true,
      }),
    ).toBe('defender-pool')
  })

  test('highlights the reveal-next control when the player should uncover the next attacker', () => {
    expect(
      getActiveAction({
        phase: 'combat',
        isDefenderHuman: true,
        canRevealNext: true,
      }),
    ).toBe('reveal-next')
  })

  test('highlights the round result before any battlefield controls', () => {
    expect(
      getActiveAction({
        roundResultVisible: true,
        phase: 'combat',
        isDefenderHuman: true,
        hasRevealedCard: true,
      }),
    ).toBe('round-result')
  })

  test('highlights the pending redo prompt when it is visible', () => {
    expect(
      getActiveAction({
        pendingDuelRedoVisible: true,
        phase: 'combat',
        isDefenderHuman: true,
        hasRevealedCard: true,
      }),
    ).toBe('pending-duel-redo')
  })

  test.each<GamePhase>(['game-over'])('can highlight the terminal banner during %s', (phase) => {
    expect(getActiveAction({ phase })).toBe('game-over')
  })

  test('returns no highlight when the npc is taking its automatic turn', () => {
    expect(
      getActiveAction({
        phase: 'combat',
        isDefenderHuman: false,
        hasRevealedCard: true,
      }),
    ).toBeNull()
  })
})
