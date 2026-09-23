import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireStaff } from '@/lib/auth';
import { signDownload } from '@/lib/r2';
import { createClient } from '@/lib/supabase/server';

import { CompileClient, type CompileTarget } from './compile-client';

export const metadata = { title: 'Compile targets' };

export default async function CompilePage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  await requireStaff();
  const { bookId } = await params;

  const supabase = await createClient();

  const { data: book } = await supabase
    .from('books')
    .select('id, title, mind_compiled_at')
    .eq('id', bookId)
    .maybeSingle();

  if (!book) notFound();

  const { data: memoryData } = await supabase
    .from('memories')
    .select('id, target_index, page_label, photo_object_key')
    .eq('book_id', bookId)
    .order('target_index');

  const memories = memoryData ?? [];
  const incomplete = memories.filter((m) => !m.photo_object_key);

  const targets: CompileTarget[] = await Promise.all(
    memories
      .filter((m) => m.photo_object_key)
      .map(async (m) => ({
        memoryId: m.id as string,
        targetIndex: m.target_index as number,
        pageLabel: (m.page_label as string | null) ?? null,
        photoUrl: await signDownload(m.photo_object_key as string),
      })),
  );

  const contiguous = targets.every((t, i) => t.targetIndex === i);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link
          href={`/admin/books/${bookId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {book.title}
        </Link>
        <h1 className="text-xl font-semibold">Compile targets</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {targets.length} photo{targets.length === 1 ? '' : 's'} to compile
          </CardTitle>
          <CardDescription>
            This builds the targets.mind file the scanner matches against. It
            runs in this browser — MindAR ships no command-line compiler — so
            keep the tab open until it finishes. Expect tens of seconds per
            photo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-1 text-sm">
            {targets.map((t) => (
              <li key={t.memoryId} className="flex items-center gap-3">
                <span className="text-muted-foreground tabular-nums">
                  #{t.targetIndex}
                </span>
                <span>{t.pageLabel ?? 'untitled'}</span>
              </li>
            ))}
          </ol>

          {incomplete.length > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {incomplete.length} memor
              {incomplete.length === 1 ? 'y has' : 'ies have'} no uploaded photo
              and will be skipped. Finish or delete them first, or the compiled
              file will not match the book.
            </p>
          ) : null}

          {!contiguous ? (
            <p className="text-sm text-red-600">
              Target indexes are not contiguous from 0. Compiling now would bind
              videos to the wrong photos. Delete and re-add the affected
              memories first.
            </p>
          ) : null}

          {book.mind_compiled_at ? (
            <p className="text-muted-foreground text-xs">
              Last compiled{' '}
              {new Date(book.mind_compiled_at as string).toLocaleString()}.
              Recompiling replaces it.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Not compiled yet — the scanner will not work until this runs.
            </p>
          )}

          {contiguous && targets.length > 0 ? (
            <CompileClient bookId={bookId} targets={targets} />
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
