/**
 * Target index N must map to the memory at position N — before and after a
 * memory is deleted or reordered in admin.
 *
 * Run with `npm test`. Uses node:test and node:assert, both built in, so this
 * adds no dependency.
 *
 * These assertions exist because the failure they guard against is silent:
 * a wrong mapping plays one customer's video on another customer's photo and
 * raises nothing anywhere.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isContiguousFromZero,
  memoryForTargetIndex,
  orderByTargetIndex,
  reindexAfterRemoval,
  reindexAfterReorder,
} from './target-mapping.ts';

/** A seeded book: four pages, in order. */
const seeded = [
  { id: 'ceremony', targetIndex: 0 },
  { id: 'speeches', targetIndex: 1 },
  { id: 'first-dance', targetIndex: 2 },
  { id: 'farewell', targetIndex: 3 },
];

/** Applies a set of moves, the way the database would. */
function apply(
  items: { id: string; targetIndex: number }[],
  moves: { id: string; targetIndex: number }[],
) {
  const next = items.map((item) => ({ ...item }));
  for (const move of moves) {
    const row = next.find((item) => item.id === move.id);
    if (row) row.targetIndex = move.targetIndex;
  }
  return next;
}

test('target index N maps to the memory at position N', () => {
  for (let n = 0; n < seeded.length; n++) {
    assert.equal(memoryForTargetIndex(seeded, n)?.id, seeded[n].id);
  }
});

test('mapping is independent of the order rows arrive in', () => {
  const shuffled = [seeded[2], seeded[0], seeded[3], seeded[1]];
  assert.equal(memoryForTargetIndex(shuffled, 0)?.id, 'ceremony');
  assert.equal(memoryForTargetIndex(shuffled, 3)?.id, 'farewell');
  assert.deepEqual(
    orderByTargetIndex(shuffled).map((m) => m.id),
    ['ceremony', 'speeches', 'first-dance', 'farewell'],
  );
});

test('a gap refuses to resolve rather than guessing', () => {
  // What a delete without renumbering leaves behind.
  const gapped = [
    { id: 'ceremony', targetIndex: 0 },
    { id: 'first-dance', targetIndex: 2 },
    { id: 'farewell', targetIndex: 3 },
  ];
  assert.equal(isContiguousFromZero(gapped), false);
  // Position 1 in the compiled file would be 'first-dance'. Returning it would
  // be exactly the silent mismatch this guards against.
  assert.equal(memoryForTargetIndex(gapped, 1), null);
  assert.equal(memoryForTargetIndex(gapped, 0), null);
});

test('duplicate indexes refuse to resolve', () => {
  const duped = [
    { id: 'ceremony', targetIndex: 0 },
    { id: 'speeches', targetIndex: 0 },
  ];
  assert.equal(isContiguousFromZero(duped), false);
  assert.equal(memoryForTargetIndex(duped, 0), null);
});

test('deleting a middle memory keeps the mapping correct', () => {
  const remaining = seeded.filter((m) => m.id !== 'speeches'); // index 1
  const after = apply(remaining, reindexAfterRemoval(remaining, 1));

  assert.equal(isContiguousFromZero(after), true);
  assert.deepEqual(
    orderByTargetIndex(after).map((m) => m.id),
    ['ceremony', 'first-dance', 'farewell'],
  );
  assert.equal(memoryForTargetIndex(after, 0)?.id, 'ceremony');
  assert.equal(memoryForTargetIndex(after, 1)?.id, 'first-dance');
  assert.equal(memoryForTargetIndex(after, 2)?.id, 'farewell');
});

test('deleting the first memory keeps the mapping correct', () => {
  const remaining = seeded.filter((m) => m.id !== 'ceremony');
  const after = apply(remaining, reindexAfterRemoval(remaining, 0));

  assert.equal(isContiguousFromZero(after), true);
  assert.equal(memoryForTargetIndex(after, 0)?.id, 'speeches');
});

test('deleting the last memory moves nothing', () => {
  const remaining = seeded.filter((m) => m.id !== 'farewell');
  assert.deepEqual(reindexAfterRemoval(remaining, 3), []);
  assert.equal(isContiguousFromZero(remaining), true);
});

test('renumbering writes ascending so a unique index never collides', () => {
  const remaining = seeded.filter((m) => m.id !== 'ceremony');
  const moves = reindexAfterRemoval(remaining, 0);

  // Each write must land on a slot already vacated by the write before it.
  const occupied = new Set(remaining.map((m) => m.targetIndex));
  for (const move of moves) {
    assert.equal(
      occupied.has(move.targetIndex),
      false,
      `index ${move.targetIndex} was still occupied when ${move.id} moved into it`,
    );
    occupied.delete(move.targetIndex + 1);
    occupied.add(move.targetIndex);
  }
});

test('reordering in admin keeps target index N at position N', () => {
  // Staff drag 'farewell' to the front.
  const newOrder = ['farewell', 'ceremony', 'speeches', 'first-dance'];
  const after = apply(seeded, reindexAfterReorder(seeded, newOrder));

  assert.equal(isContiguousFromZero(after), true);
  newOrder.forEach((id, position) => {
    assert.equal(
      memoryForTargetIndex(after, position)?.id,
      id,
      `position ${position} should be ${id}`,
    );
  });
});

test('reordering reports only the rows that actually move', () => {
  const unchanged = seeded.map((m) => m.id);
  assert.deepEqual(reindexAfterReorder(seeded, unchanged), []);

  // Swapping the middle pair moves exactly those two.
  const swapped = ['ceremony', 'first-dance', 'speeches', 'farewell'];
  const moves = reindexAfterReorder(seeded, swapped);
  assert.deepEqual(
    moves.map((m) => m.id).sort(),
    ['first-dance', 'speeches'],
  );
});

test('a reorder followed by a delete still resolves correctly', () => {
  const reordered = apply(
    seeded,
    reindexAfterReorder(seeded, ['farewell', 'ceremony', 'speeches', 'first-dance']),
  );
  // Now remove whatever sits at index 1.
  const victim = memoryForTargetIndex(reordered, 1);
  assert.ok(victim);
  const remaining = reordered.filter((m) => m.id !== victim.id);
  const after = apply(remaining, reindexAfterRemoval(remaining, 1));

  assert.equal(isContiguousFromZero(after), true);
  assert.deepEqual(
    orderByTargetIndex(after).map((m) => m.id),
    ['farewell', 'speeches', 'first-dance'],
  );
});
