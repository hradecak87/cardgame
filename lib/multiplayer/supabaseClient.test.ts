import { getSupabaseClient } from './supabaseClient'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Mock @supabase/supabase-js at module level so createClient is always mocked
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

// Restoring via plain assignment would coerce `undefined` into the string
// "undefined" (Node stringifies process.env assignments), so delete the
// key entirely when there was no original value.
function restoreEnv(): void {
  if (originalUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  }

  if (originalKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  }
}

describe('getSupabaseClient', () => {

  afterEach(() => {
    restoreEnv()
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('throws a clear error when env vars are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    jest.resetModules()
    // eslint-disable-next-line global-require
    const { getSupabaseClient: freshGetSupabaseClient } = require('./supabaseClient')

    expect(() => freshGetSupabaseClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('returns the same client instance on repeated calls (singleton)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    jest.resetModules()
    // Mock createClient to return a dummy client
    const mockClient = { auth: {}, db: {} }
    // eslint-disable-next-line global-require
    const { createClient } = require('@supabase/supabase-js')
    createClient.mockReturnValue(mockClient)

    // eslint-disable-next-line global-require
    const { getSupabaseClient: freshGetSupabaseClient } = require('./supabaseClient')

    const first = freshGetSupabaseClient()
    const second = freshGetSupabaseClient()
    expect(first).toBe(second)
  })
})

describe('ensureAnonymousSession', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  afterEach(() => {
    restoreEnv()
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('reuses an existing session instead of signing in again', async () => {
    jest.resetModules()
    const mockClient = {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'existing-uid' } } } }),
        signInAnonymously: jest.fn(),
      },
    }
    // eslint-disable-next-line global-require
    const { createClient } = require('@supabase/supabase-js')
    createClient.mockReturnValue(mockClient)

    // eslint-disable-next-line global-require
    const supabaseModule = require('./supabaseClient')

    const uid = await supabaseModule.ensureAnonymousSession()

    expect(uid).toBe('existing-uid')
    expect(mockClient.auth.getSession).toHaveBeenCalled()
    expect(mockClient.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('signs in anonymously when there is no existing session', async () => {
    jest.resetModules()
    const mockClient = {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        signInAnonymously: jest.fn().mockResolvedValue({ data: { user: { id: 'new-uid' } }, error: null }),
      },
    }
    // eslint-disable-next-line global-require
    const { createClient } = require('@supabase/supabase-js')
    createClient.mockReturnValue(mockClient)

    // eslint-disable-next-line global-require
    const supabaseModule = require('./supabaseClient')

    const uid = await supabaseModule.ensureAnonymousSession()

    expect(uid).toBe('new-uid')
  })

  it('throws when sign-in fails', async () => {
    jest.resetModules()
    const mockClient = {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        signInAnonymously: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'network down' } }),
      },
    }
    // eslint-disable-next-line global-require
    const { createClient } = require('@supabase/supabase-js')
    createClient.mockReturnValue(mockClient)

    // eslint-disable-next-line global-require
    const supabaseModule = require('./supabaseClient')

    await expect(supabaseModule.ensureAnonymousSession()).rejects.toThrow(/network down/)
  })
})
