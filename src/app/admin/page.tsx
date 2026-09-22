import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireStaff } from '@/lib/auth';
import { isoDaysFromNow } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Admin' };

export default async function AdminHome() {
  const staff = await requireStaff();
  const supabase = await createClient();

  const [customers, books, expiring] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('books').select('id', { count: 'exact', head: true }),
    supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
      .not('expiry_date', 'is', null)
      .lte('expiry_date', isoDaysFromNow(30))
      .is('revoked_at', null),
  ]);

  const tiles = [
    { label: 'Customers', value: customers.count ?? 0, href: '/admin/customers' },
    { label: 'Books', value: books.count ?? 0, href: '/admin/books' },
    {
      label: 'Expiring within 30 days',
      value: expiring.count ?? 0,
      href: '/admin/books',
    },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Signed in as {staff.label}</h1>
        <p className="text-muted-foreground text-sm">{staff.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="hover:bg-accent transition-colors">
              <CardHeader className="pb-2">
                <CardDescription>{t.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {t.value}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not built yet</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <p>Photo and video upload, and R2 storage wiring.</p>
          <p>Trackability scoring from the compiled .mind file.</p>
          <p>QR and print file generation.</p>
          <p>The public /b/[bookId] page and the scanner.</p>
        </CardContent>
      </Card>
    </main>
  );
}
