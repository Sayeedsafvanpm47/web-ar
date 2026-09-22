'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type FormState = { error: string | null; ok: boolean };

export async function createCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Authorisation is re-checked here, not inherited from the proxy.
  const staff = await requireStaff();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!fullName) return { error: 'A name is required.', ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from('customers').insert({
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    created_by: staff.userId,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath('/admin/customers');
  return { error: null, ok: true };
}
