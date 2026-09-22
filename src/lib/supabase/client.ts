/**
 * Supabase client for browser (client component) use.
 *
 * Uses the anon key, so every query is subject to Row Level Security. That is
 * the point: the admin UI acts as the signed-in staff member, not as a
 * superuser, so the policies in the migration are what actually enforce
 * access. The service role key is never used on this side.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
