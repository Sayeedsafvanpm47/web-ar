import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireStaff } from '@/lib/auth';
import { todayISO } from '@/lib/dates';
import { signDownload } from '@/lib/r2';
import { createClient } from '@/lib/supabase/server';

import { MemoryRow, type MemoryView } from './memory-row';
import { MemoryUploader } from './memory-uploader';

type BookDetail = {
  id: string;
  title: string;
  status: string;
  expiry_date: string | null;
  revoked_at: string | null;
  customers: { full_name: string } | null;
};

type MemoryRecord = {
  id: string;
  target_index: number;
  page_label: string | null;
  photo_object_key: string | null;
  video_object_key: string | null;
  photo_aspect: number | null;
  video_duration_seconds: number | null;
};

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  await requireStaff();
  const { bookId } = await params;

  const supabase = await createClient();

  const { data: bookData } = await supabase
    .from('books')
    .select('id, title, status, expiry_date, revoked_at, customers(full_name)')
    .eq('id', bookId)
    .maybeSingle();

  if (!bookData) notFound();
  const book = bookData as unknown as BookDetail;

  const { data: memoryData } = await supabase
    .from('memories')
    .select(
      'id, target_index, page_label, photo_object_key, video_object_key, photo_aspect, video_duration_seconds',
    )
    .eq('book_id', bookId)
    .order('target_index');

  const records = (memoryData ?? []) as MemoryRecord[];

  // Thumbnails are short-lived signed URLs, minted per request. Nothing in the
  // bucket is publicly reachable.
  const memories: MemoryView[] = await Promise.all(
    records.map(async (m) => ({
      ...m,
      photoUrl: m.photo_object_key
        ? await signDownload(m.photo_object_key)
        : null,
    })),
  );

  const today = todayISO();
  const live =
    !book.revoked_at && !!book.expiry_date && book.expiry_date >= today;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/books"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Books
          </Link>
          <h1 className="text-xl font-semibold">{book.title}</h1>
          <p className="text-muted-foreground text-sm">
            {book.customers?.full_name ?? 'no customer'} · {book.status}
          </p>
        </div>
        <Badge variant={live ? 'default' : 'secondary'}>
          {book.revoked_at
            ? 'revoked'
            : !book.expiry_date
              ? 'no expiry set'
              : live
                ? `live until ${book.expiry_date}`
                : 'expired'}
        </Badge>
      </div>

      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Scan link — treat as a secret</CardTitle>
          <CardDescription className="text-xs">
            This URL is the whole credential. Anyone who has it can watch this
            customer&apos;s videos, so keep it out of email, chat and screenshots.
            If it leaks, revoke the book — reprinting the same code will not
            help.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="text-xs break-all">/b/{book.id}</code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a memory</CardTitle>
          <CardDescription>
            One printed photo and the video it plays. Order matters — each
            memory gets the next target index, and that index is what binds a
            photo to its video in the compiled .mind file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemoryUploader bookId={book.id} />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Index</TableHead>
            <TableHead>Photo</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Aspect</TableHead>
            <TableHead>Length</TableHead>
            <TableHead>State</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {memories.map((m) => (
            <MemoryRow key={m.id} bookId={book.id} memory={m} />
          ))}
        </TableBody>
      </Table>

      {memories.length === 0 ? (
        <p className="text-muted-foreground text-sm">No memories yet.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Still to come</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <p>Compiling targets.mind from these photos, with trackability scores.</p>
          <p>QR and print file generation.</p>
          <p>The public /b/{'{bookId}'} page and the scanner.</p>
        </CardContent>
      </Card>
    </main>
  );
}
