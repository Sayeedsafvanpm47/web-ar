'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createCustomer, type FormState } from './actions';

const initialState: FormState = { error: null, ok: false };

export function CustomerForm() {
  const [state, formAction, pending] = useActionState(
    createCustomer,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="full_name">Name</Label>
        <Input id="full_name" name="full_name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" />
      </div>

      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add customer'}
        </Button>
        {state.error ? (
          <span className="ml-3 text-sm text-red-600">{state.error}</span>
        ) : null}
        {state.ok ? (
          <span className="ml-3 text-sm text-green-700">Added.</span>
        ) : null}
      </div>
    </form>
  );
}
