'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createBook, type FormState } from './actions';

const initialState: FormState = { error: null, ok: false };

export type CustomerOption = { id: string; full_name: string };

export function BookForm({ customers }: { customers: CustomerOption[] }) {
  const [state, formAction, pending] = useActionState(createBook, initialState);

  if (customers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a customer first — every book belongs to one.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="customer_id">Customer</Label>
        <select
          id="customer_id"
          name="customer_id"
          required
          className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expiry_date">Hosting expires</Label>
        <Input id="expiry_date" name="expiry_date" type="date" />
        <p className="text-muted-foreground text-xs">
          Leave blank and the book will not be publicly viewable.
        </p>
      </div>

      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create book'}
        </Button>
        {state.error ? (
          <span className="ml-3 text-sm text-red-600">{state.error}</span>
        ) : null}
        {state.ok ? (
          <span className="ml-3 text-sm text-green-700">Created.</span>
        ) : null}
      </div>
    </form>
  );
}
