import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareHashes,
  dHashFromLuma,
  findDuplicate,
  hammingDistance,
  rateTrackability,
  TRACKABILITY,
} from './photo-check.ts';

/** 9x8 brightness samples, the shape a canvas downscale produces. */
function luma(fn: (x: number, y: number) => number): number[] {
  const out: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) out.push(fn(x, y));
  return out;
}

test('trackability bands match the spike measurements', () => {
  // The three spike targets all tracked reliably.
  assert.equal(rateTrackability(1633), 'good');
  assert.equal(rateTrackability(2464), 'good');

  assert.equal(rateTrackability(TRACKABILITY.warn), 'good');
  assert.equal(rateTrackability(TRACKABILITY.warn - 1), 'weak');
  assert.equal(rateTrackability(TRACKABILITY.reject), 'weak');
  assert.equal(rateTrackability(TRACKABILITY.reject - 1), 'unusable');
  assert.equal(rateTrackability(0), 'unusable');
});

test('an uncompiled photo is treated as weak, not as good', () => {
  // Never let "we have not measured it" read as "it is fine".
  assert.equal(rateTrackability(null), 'weak');
});

test('dHash is 16 hex characters', () => {
  const hash = dHashFromLuma(luma((x) => x * 20));
  assert.equal(hash.length, 16);
  assert.match(hash, /^[0-9a-f]{16}$/);
});

test('dHash rejects the wrong number of samples', () => {
  assert.throws(() => dHashFromLuma([1, 2, 3]), /expects 72 samples/);
});

test('a flat image hashes to all zeroes', () => {
  // No pixel is brighter than its neighbour.
  assert.equal(dHashFromLuma(luma(() => 128)), '0000000000000000');
});

test('the same image hashes identically', () => {
  const gradient = luma((x, y) => x * 17 + y * 3);
  assert.equal(dHashFromLuma(gradient), dHashFromLuma(gradient));
});

test('a uniform brightness shift does not change the hash', () => {
  // Exposure differences between two scans of the same print must not read as
  // two different photos.
  const base = luma((x, y) => x * 17 + y * 3);
  const brighter = base.map((v) => v + 40);
  assert.equal(dHashFromLuma(base), dHashFromLuma(brighter));
});

test('different images hash differently', () => {
  const rising = dHashFromLuma(luma((x) => x * 20));
  const falling = dHashFromLuma(luma((x) => 200 - x * 20));
  assert.notEqual(rising, falling);
  assert.ok(hammingDistance(rising, falling) > 10);
});

test('hamming distance counts differing bits', () => {
  assert.equal(hammingDistance('0000000000000000', '0000000000000000'), 0);
  assert.equal(hammingDistance('0000000000000001', '0000000000000000'), 1);
  assert.equal(hammingDistance('f000000000000000', '0000000000000000'), 4);
});

test('hamming distance refuses mismatched lengths', () => {
  assert.throws(() => hammingDistance('ff', 'ffff'), /same length/);
});

test('similarity bands', () => {
  assert.equal(compareHashes('0000000000000000', '0000000000000000'), 'identical');
  // 5 bits apart — close enough for a human to look at.
  assert.equal(compareHashes('0000000000000000', '000000000000001f'), 'similar');
  // 16 bits apart — different photographs.
  assert.equal(compareHashes('0000000000000000', 'ffff000000000000'), 'distinct');
});

test('findDuplicate reports the closest match, not the first', () => {
  const existing = [
    { id: 'a', label: 'Page 1', hash: '000000000000001f' }, // 5 bits
    { id: 'b', label: 'Page 2', hash: '0000000000000001' }, // 1 bit
    { id: 'c', label: 'Page 3', hash: 'ffffffffffffffff' }, // far
  ];
  const found = findDuplicate('0000000000000000', existing);
  assert.ok(found);
  assert.equal(found.against.id, 'b');
  assert.equal(found.similarity, 'identical');
  assert.equal(found.distance, 1);
});

test('findDuplicate returns nothing when every photo is distinct', () => {
  const existing = [
    { id: 'a', label: 'Page 1', hash: 'ffffffffffffffff' },
    { id: 'b', label: 'Page 2', hash: 'aaaaaaaaaaaaaaaa' },
  ];
  assert.equal(findDuplicate('0000000000000000', existing), null);
});

test('findDuplicate ignores photos with no usable hash', () => {
  // Rows uploaded before hashing existed must not crash the check.
  const existing = [
    { id: 'a', label: 'Page 1', hash: '' },
    { id: 'b', label: 'Page 2', hash: 'short' },
  ];
  assert.equal(findDuplicate('0000000000000000', existing), null);
});
