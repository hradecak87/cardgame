/**
 * @jest-environment jsdom
 */

import { loadStoredRoomCode, ROOM_CODE_STORAGE_KEY } from './useMultiplayerGameState'

describe('loadStoredRoomCode', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredRoomCode(null)).toBeNull()
  })

  it('returns the stored code when it looks like a valid 5-digit code', () => {
    expect(loadStoredRoomCode('04213')).toBe('04213')
  })

  it('rejects malformed stored values', () => {
    expect(loadStoredRoomCode('not-a-code')).toBeNull()
    expect(loadStoredRoomCode('123')).toBeNull()
  })
})

describe('ROOM_CODE_STORAGE_KEY', () => {
  it('is a stable, namespaced key', () => {
    expect(ROOM_CODE_STORAGE_KEY).toBe('battle-card-game-multiplayer-room-code')
  })
})
