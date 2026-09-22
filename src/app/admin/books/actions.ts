'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type FormState = { error: string | null; ok: boolean };

export async function createBook(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const staff = await requireStaff();

  const title = String(formData.get('title') ?? '').trim();
  const customerId = String(formData.get('customer_id') ?? '').trim();
  const expiryDate = String(formData.get('expiry_date') ?? '').trim();

  if (!title) return { error: 'A title is required.', ok: false };
  if (!customerId) return { error: 'Choose a customer.', ok: false };

  const supabase = await createClient();

  // expiry_date is nullable in the schema and fails closed: a book with no
  // term set is not publicly viewable. Leaving it blank here creates a book
  // that staff can work on but nobody can scan yet, which is intended.
  const { error } = await supabase.from('books').insert({
    title,
    customer_id: customerId,
    expiry_date: expiryDate || null,
    created_by: staff.userId,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath('/admin/books');
  return { error: null, ok: true };
}
