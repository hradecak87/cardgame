import { createRoomWithRetry, generateRoomCode } from './roomCode'

describe('generateRoomCode', () => {
  it('returns a 5-digit numeric string', () => {
    const code = generateRoomCode(() => 0.123456)

    expect(code).toMatch(/^\d{5}$/)
  })

  it('is deterministic for a given rng', () => {
    const rng = () => 0.5
    expect(generateRoomCode(rng)).toBe(generateRoomCode(rng))
  })
})

describe('createRoomWithRetry', () => {
  it('returns the code from the first successful attempt', async () => {
    const attemptCodes: string[] = []
    const insertRoom = jest.fn(async (code: string) => {
      attemptCodes.push(code)
      return { ok: true as const }
    })

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(result).toEqual({ ok: true, code: attemptCodes[0] })
    expect(insertRoom).toHaveBeenCalledTimes(1)
  })

  it('retries up to 5 times on collision, then gives up', async () => {
    const insertRoom = jest.fn(async () => ({ ok: false as const, reason: 'collision' as const }))

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(insertRoom).toHaveBeenCalledTimes(5)
    expect(result).toEqual({ ok: false, reason: 'exhausted-retries' })
  })

  it('succeeds on a later attempt after earlier collisions', async () => {
    let call = 0
    const insertRoom = jest.fn(async () => {
      call += 1
      return call < 3 ? { ok: false as const, reason: 'collision' as const } : { ok: true as const }
    })

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(result.ok).toBe(true)
    expect(insertRoom).toHaveBeenCalledTimes(3)
  })

  it('propagates a non-collision failure immediately without retrying', async () => {
    const insertRoom = jest.fn(async () => ({ ok: false as const, reason: 'network-error' as const }))

    const result = await createRoomWithRetry(insertRoom, () => 0.5)

    expect(insertRoom).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: false, reason: 'network-error' })
  })
})
