'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type LoginState = { error: string | null };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: do not reveal whether the address exists.
    return { error: 'Those credentials were not accepted.' };
  }

  redirect('/admin');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
