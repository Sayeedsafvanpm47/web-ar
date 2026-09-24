/**
 * Next.js 16 proxy (formerly middleware).
 *
 * Its ONLY security job is refreshing the Supabase session cookie. The redirect
 * below is a convenience so signed-out staff land on the login screen instead
 * of an empty page.
 *
 * It is NOT the access control. Next's own docs warn that a matcher change or
 * moving a Server Function to another route can silently remove proxy
 * coverage, so authorisation is re-checked inside every admin page and every
 * server action via requireStaff(). Defence here is convenience; defence there
 * is the real thing — and RLS in Postgres is the layer that holds even if both
 * are wrong.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without configuration, createServerClient() throws — and because this
  // runs on every request, that turns a missing environment variable into a
  // blank 500 on every page, including ones that need no auth at all.
  //
  // Pass through instead. This is safe precisely because the proxy is not the
  // security boundary: requireStaff() gates each admin page and server action,
  // and RLS gates the database. Those fail closed and say what is wrong.
  if (!url || !anonKey) {
    console.error(
      'proxy: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are ' +
        'not set. Skipping session refresh. Set them in the hosting ' +
        'environment — see DEPLOY.md.',
    );
    return response;
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the auth token. Do not remove, and do not refresh anywhere else —
  // refreshing in two places signs users out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith('/admin/login');

  if (!user && pathname.startsWith('/admin') && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
