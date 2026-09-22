'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { signIn, type LoginState } from './actions';

const initialState: LoginState = { error: null };

export function LoginForm({ denied }: { denied: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {denied ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          That account is signed in but is not a staff member.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
