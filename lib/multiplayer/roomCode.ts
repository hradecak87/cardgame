const MAX_ATTEMPTS = 5

/**
 * Generates a random 5-digit numeric room code, e.g. "04213".
 * Zero-padded so the result is always exactly 5 characters.
 */
export function generateRoomCode(rng: () => number = Math.random): string {
  const value = Math.floor(rng() * 100000)
  return value.toString().padStart(5, '0')
}

export type InsertRoomResult =
  | { ok: true }
  | { ok: false; reason: 'collision' | 'network-error' }

export type CreateRoomResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'exhausted-retries' | 'network-error' }

/**
 * Generates a room code and attempts to insert a room row via the supplied
 * `insertRoom` callback (expected to attempt a unique-constrained insert and
 * report back whether it collided). Retries with a fresh code up to
 * MAX_ATTEMPTS times on a 'collision' result; any other failure reason is
 * propagated immediately without retrying, since retrying wouldn't help.
 */
export async function createRoomWithRetry(
  insertRoom: (code: string) => Promise<InsertRoomResult>,
  rng: () => number = Math.random,
): Promise<CreateRoomResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode(rng)
    const result = await insertRoom(code)

    if (result.ok) {
      return { ok: true, code }
    }

    if (result.reason !== 'collision') {
      return { ok: false, reason: result.reason }
    }
  }

  return { ok: false, reason: 'exhausted-retries' }
}
