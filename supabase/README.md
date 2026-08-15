# Supabase setup for online multiplayer

This project uses Supabase (Postgres + Realtime + Anonymous Auth) only for
the "Hrát s kamarádem online" multiplayer mode. Single-player vs. NPC never
touches Supabase.

## One-time setup
1. Create a Supabase project at https://supabase.com/dashboard.
2. Authentication → Providers → enable **Anonymous Sign-Ins**.
3. Run the SQL files in `supabase/migrations/` in order (SQL Editor, or
   `supabase db push` if using the CLI) — creates `rooms`, `player_hands`,
   and the `deal_room` function.
4. Copy `.env.local.example` to `.env.local` and fill in the values from
   Project Settings → API (`Project URL` → `NEXT_PUBLIC_SUPABASE_URL`,
   `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
5. Add the same two env vars in Vercel (Project → Settings →
   Environment Variables) so the deployed app can reach Supabase too.
