import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { getStaffSession } from '@/lib/auth';

import { signOut } from './login/actions';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chrome only — this decides what to render, it does not gate anything.
  // Each page calls requireStaff() for that.
  const session = await getStaffSession();

  return (
    <div className="min-h-dvh">
      {session ? (
        <header className="border-b">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/admin" className="font-semibold">
              Black Pearl
            </Link>
            <Link href="/admin/customers" className="text-muted-foreground hover:text-foreground">
              Customers
            </Link>
            <Link href="/admin/books" className="text-muted-foreground hover:text-foreground">
              Books
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-muted-foreground">{session.label}</span>
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </nav>
        </header>
      ) : null}
      {children}
    </div>
  );
}
