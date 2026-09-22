import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireStaff } from '@/lib/auth';
import { todayISO } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

import { BookForm, type CustomerOption } from './book-form';

export const metadata = { title: 'Books' };

type BookRow = {
  id: string;
  title: string;
  status: string;
  expiry_date: string | null;
  revoked_at: string | null;
  customers: { full_name: string } | null;
};

/**
 * Mirrors public.book_is_live() in the database. Display only — the server
 * path that actually serves a book re-checks this against the database, so a
 * mistake here cannot make an expired book viewable.
 */
function liveState(
  book: BookRow,
  today: string,
): { label: string; live: boolean } {
  if (book.revoked_at) return { label: 'revoked', live: false };
  if (!book.expiry_date) return { label: 'no expiry set', live: false };
  if (book.expiry_date < today) return { label: 'expired', live: false };
  return { label: `live until ${book.expiry_date}`, live: true };
}

export default async function BooksPage() {
  await requireStaff();
  const today = todayISO();

  const supabase = await createClient();

  const [{ data: bookData, error }, { data: customerData }] = await Promise.all(
    [
      supabase
        .from('books')
        .select('id, title, status, expiry_date, revoked_at, customers(full_name)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('customers')
        .select('id, full_name')
        .order('full_name')
        .limit(500),
    ],
  );

  const books = (bookData ?? []) as unknown as BookRow[];
  const customers = (customerData ?? []) as CustomerOption[];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Books</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm customers={customers} />
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-red-600">Could not load books: {error.message}</p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Public access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {books.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No books yet.
              </TableCell>
            </TableRow>
          ) : (
            books.map((b) => {
              const state = liveState(b, today);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/books/${b.id}`} className="hover:underline">
                      {b.title}
                    </Link>
                  </TableCell>
                  <TableCell>{b.customers?.full_name ?? '—'}</TableCell>
                  <TableCell>{b.status}</TableCell>
                  <TableCell>
                    <Badge variant={state.live ? 'default' : 'secondary'}>
                      {state.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <p className="text-muted-foreground text-xs">
        Book IDs are deliberately not shown in this list. They are the access
        credential printed in the QR code — they will appear only on a book&apos;s
        own page, alongside its print files.
      </p>
    </main>
  );
}
