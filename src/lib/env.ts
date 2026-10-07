/**
 * Typed environment access with a hard server/client boundary.
 *
 * Hard rule 4: SUPABASE_SERVICE_ROLE_KEY is server-only. The guard below is a
 * runtime backstop, not the primary defence — the primary defence is never
 * importing this module's server half from a client component. `npm run
 * check:secrets` enforces that statically.
 */

function assertServer(name: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `${name} was read in the browser. This is a server-only secret; ` +
        'something is importing server code into a client component.',
    );
  }
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Safe to reference from client components.
 *
 * A function rather than a const so a missing variable fails when something
 * actually needs it, not at module-import time during a build.
 */
export function publicEnv() {
  return {
    supabaseUrl: required(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseAnonKey: required(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  } as const;
}

/**
 * Never reference from a client component. Throws if evaluated in a browser.
 *
 * Signed-URL TTLs deliberately live in src/lib/r2.ts rather than here: that is
 * the only module that mints a signed URL, and having a second copy of the
 * setting invites the two drifting apart.
 */
export function serverEnv() {
  assertServer('serverEnv');
  return {
    supabaseServiceRoleKey: required(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  } as const;
}
