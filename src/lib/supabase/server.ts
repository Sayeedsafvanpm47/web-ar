/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Carries the signed-in staff member's session and the anon key, so RLS
 * applies to everything it does. Admin screens deliberately run through this
 * rather than the service role: if a policy is wrong, the admin UI breaks
 * loudly instead of quietly working anyway.
 *
 * The service-role client (src/lib/supabase/admin.ts) exists only for the
 * public book path, which has no session to act on behalf of.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies cannot be set.
            // The proxy refreshes the session instead, so this is safe.
          }
        },
      },
    },
  );
}
