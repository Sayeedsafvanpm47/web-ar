/**
 * The staff gate.
 *
 * Call requireStaff() at the top of every /admin page and every server action
 * that touches customer data. Do not rely on the proxy for this — see the
 * comment in src/proxy.ts.
 *
 * Two conditions, both required:
 *   1. a valid Supabase Auth session
 *   2. a matching row in public.staff
 *
 * Having a login is not authorisation. The second check is what separates a
 * signed-in stranger from staff, and it is the same condition the RLS policies
 * enforce in the database, so the two cannot drift.
 */
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type StaffSession = {
  userId: string;
  email: string | null;
  label: string;
};

/** Returns the staff session, or redirects to the login screen. */
export async function requireStaff(): Promise<StaffSession> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  // RLS on public.staff only exposes the caller's own row, so this both
  // confirms membership and cannot be used to enumerate colleagues.
  const { data: staff, error } = await supabase
    .from('staff')
    .select('user_id, label')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !staff) {
    redirect('/admin/login?denied=1');
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    label: staff.label as string,
  };
}

/** Non-redirecting variant, for deciding what to render rather than gating. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staff } = await supabase
    .from('staff')
    .select('user_id, label')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!staff) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    label: staff.label as string,
  };
}
