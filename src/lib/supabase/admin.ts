/**
 * Supabase client holding the service role key.
 *
 * This client BYPASSES Row Level Security entirely. Every query made through
 * it is unconstrained, so each call site is responsible for its own scoping —
 * in particular, public book reads must filter by the exact book id from the
 * URL and must reject revoked books.
 *
 * Never import this from a client component. See CLAUDE.md hard rule 4.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { publicEnv, serverEnv } from '@/lib/env';

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createAdminClient() was called in the browser. The service role key ' +
        'must never reach the client.',
    );
  }
  if (cached) return cached;

  cached = createClient(
    publicEnv().supabaseUrl,
    serverEnv().supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'black-pearl-admin' } },
    },
  );
  return cached;
}
