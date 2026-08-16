import type { ReactNode } from 'react';

// No-op today -- this pilot is a fully open link, no login required, per the
// initial student-testing round. Left as a wrapping component (rather than
// rendering {children} directly in layout.tsx) so gating access later is a
// one-file change, not a restructure:
//   1. Make this a client component, read the session via the existing
//      Supabase client (lib/supabaseClient.ts already exports `supabase`;
//      use supabase.auth.getSession() / onAuthStateChange).
//   2. Look up the caller's public.hanmath_profiles row (id = auth user id)
//      and/or public.hanmath_subscriptions for plan gating -- both tables
//      and their RLS policies already exist (see
//      supabase/migrations/20260813120000_hanmath_tables.sql).
//   3. Render a sign-in prompt instead of {children} when unauthenticated,
//      exactly as this component already returns a single subtree today.
export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
