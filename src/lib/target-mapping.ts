/**
 * The binding between a printed photo and the video that plays on it.
 *
 * This is the most dangerous logic in the product and the least visible when
 * it goes wrong. A compiled target file stores no names — only positions — so
 * `targetIndex: 2` means "the third image handed to the compiler" and nothing
 * else. If the database and that file ever disagree about ordering, the
 * scanner plays one family's video on another family's photo, and nothing
 * anywhere raises an error.
 *
 * Every rule that decides ordering lives here, pure and without a database or
 * a browser, so it can be tested directly. See src/lib/target-mapping.test.ts.
 */

export type Positioned = { id: string; targetIndex: number };

/** Ascending by target index. Compile order IS target index. */
export function orderByTargetIndex<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.targetIndex - b.targetIndex);
}

/**
 * True when indexes run 0, 1, 2 … with no gaps and no duplicates.
 *
 * A gap is not cosmetic. The compiler is handed N images and numbers them 0..N-1,
 * so a database holding 0, 1, 3 produces a file where position 2 is the photo
 * the database calls 3 — every page after the gap is shifted onto the wrong
 * video.
 */
export function isContiguousFromZero(items: readonly Positioned[]): boolean {
  const ordered = orderByTargetIndex(items);
  return ordered.every((item, i) => item.targetIndex === i);
}

/**
 * The memory a given target index refers to, or null if the set is not safe to
 * resolve against.
 *
 * Refuses on a non-contiguous set rather than guessing. Showing a customer
 * nothing is recoverable; showing them someone else's funeral is not.
 */
export function memoryForTargetIndex<T extends Positioned>(
  items: readonly T[],
  targetIndex: number,
): T | null {
  if (!isContiguousFromZero(items)) return null;
  return orderByTargetIndex(items)[targetIndex] ?? null;
}

/**
 * How the remaining memories renumber after one is removed.
 *
 * Returns only the rows that actually move, in the order they must be written.
 * Ascending matters: each slot is vacated before the next row moves into it,
 * so a unique (book_id, target_index) constraint never trips mid-renumber.
 */
export function reindexAfterRemoval<T extends Positioned>(
  remaining: readonly T[],
  removedTargetIndex: number,
): { id: string; targetIndex: number }[] {
  return orderByTargetIndex(remaining)
    .filter((item) => item.targetIndex > removedTargetIndex)
    .map((item) => ({ id: item.id, targetIndex: item.targetIndex - 1 }));
}

/**
 * How memories renumber when staff drag one to a new position.
 *
 * Takes the ids in their new visual order and assigns 0..N-1. Returns only the
 * rows that move. Written here rather than in the admin UI so the reorder rule
 * and the read rule cannot drift apart.
 */
export function reindexAfterReorder<T extends Positioned>(
  items: readonly T[],
  idsInNewOrder: readonly string[],
): { id: string; targetIndex: number }[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const moves: { id: string; targetIndex: number }[] = [];

  idsInNewOrder.forEach((id, position) => {
    const item = byId.get(id);
    if (item && item.targetIndex !== position) {
      moves.push({ id, targetIndex: position });
    }
  });

  return moves;
}
