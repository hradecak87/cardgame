import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

/**
 * Lazily creates (and caches) the single Supabase client instance used by
 * the multiplayer feature. Reads config from env vars so both local dev
 * (.env.local) and Vercel (project env vars) work without code changes.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase config: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see supabase/README.md).',
    )
  }

  cachedClient = createClient(url, anonKey)
  return cachedClient
}

/**
 * Ensures the current browser has a Supabase anonymous-auth session,
 * signing in if needed. The SDK persists the resulting session (and its
 * auth.uid()) in localStorage automatically, which is what lets a reload
 * be recognized as the same player later.
 */
export async function ensureAnonymousSession(): Promise<string> {
  const client = getSupabaseClient()
  const { data: sessionData } = await client.auth.getSession()

  if (sessionData.session?.user.id) {
    return sessionData.session.user.id
  }

  const { data, error } = await client.auth.signInAnonymously()

  if (error || !data.user) {
    throw new Error(`Failed to start an anonymous Supabase session: ${error?.message ?? 'unknown error'}`)
  }

  return data.user.id
}
