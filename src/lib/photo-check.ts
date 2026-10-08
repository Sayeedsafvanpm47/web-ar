/**
 * Catching photos that will not track, and photos that will track as each
 * other, before a book goes to print.
 *
 * Both failures are expensive in the same way: they are only discovered after
 * a hardback book exists, and the near-duplicate one is worse than it sounds.
 * MindAR matches whichever target scores highest, so two similar photos in one
 * book mean a customer can hold their phone over page 4 and watch page 9's
 * video, with nothing anywhere reporting an error.
 *
 * Everything here is pure so it can be tested without a browser or a database.
 * See photo-check.test.ts.
 */

/** Trackability thresholds, in total feature points from the compiler.
 *
 * Calibrated against the three spike targets, which scored 1633 / 2074 / 2464
 * and all tracked reliably. The floor is set well below the weakest of those.
 * These are extrapolated from a small sample and should be re-tuned once real
 * customer photos have been through the compiler.
 */
export const TRACKABILITY = {
  /** Below this a photo is very unlikely to be found at all. */
  reject: 300,
  /** Below this it will probably only track up close, in good light. */
  warn: 800,
} as const;

export type Trackability = 'good' | 'weak' | 'unusable';

export function rateTrackability(featurePointsTotal: number | null): Trackability {
  if (featurePointsTotal === null) return 'weak';
  if (featurePointsTotal < TRACKABILITY.reject) return 'unusable';
  if (featurePointsTotal < TRACKABILITY.warn) return 'weak';
  return 'good';
}

/**
 * Difference hash: 8x8 greyscale, each bit saying "is this pixel brighter than
 * the one to its right".
 *
 * Deliberately tolerant of scale, compression and small colour shifts, because
 * the case to catch is "the same photo uploaded twice" and "two frames from
 * the same moment", not "two photographs of the same wedding".
 *
 * `luma` is 9x8 = 72 brightness samples in row-major order, which is what a
 * canvas downscale produces. Returns 64 bits as a 16-character hex string.
 */
export function dHashFromLuma(luma: readonly number[]): string {
  const WIDTH = 9;
  const HEIGHT = 8;
  if (luma.length !== WIDTH * HEIGHT) {
    throw new Error(`dHashFromLuma expects ${WIDTH * HEIGHT} samples, got ${luma.length}`);
  }

  let bits = '';
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH - 1; x++) {
      bits += luma[y * WIDTH + x] > luma[y * WIDTH + x + 1] ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Differing bits between two hashes. 0 is identical, 64 is maximally unlike. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error('hammingDistance needs two hashes of the same length');
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/**
 * How close two photos may be before they are a problem.
 *
 * 0-4 bits apart is effectively the same image — a re-upload, a re-crop, a
 * re-compression. 5-10 is close enough to be worth a human looking. Above that
 * they are different photographs.
 */
export const DUPLICATE = {
  identical: 4,
  similar: 10,
} as const;

export type Similarity = 'identical' | 'similar' | 'distinct';

export function compareHashes(a: string, b: string): Similarity {
  const distance = hammingDistance(a, b);
  if (distance <= DUPLICATE.identical) return 'identical';
  if (distance <= DUPLICATE.similar) return 'similar';
  return 'distinct';
}

export type HashedPhoto = { id: string; label: string; hash: string };

export type DuplicateFinding = {
  against: HashedPhoto;
  similarity: Exclude<Similarity, 'distinct'>;
  distance: number;
};

/**
 * The closest existing photo to a candidate, if it is close enough to matter.
 *
 * Returns the single worst offender rather than every match: staff need to
 * decide about this upload, not read a report.
 */
export function findDuplicate(
  candidateHash: string,
  existing: readonly HashedPhoto[],
): DuplicateFinding | null {
  let worst: DuplicateFinding | null = null;

  for (const photo of existing) {
    if (!photo.hash || photo.hash.length !== candidateHash.length) continue;
    const distance = hammingDistance(candidateHash, photo.hash);
    const similarity = compareHashes(candidateHash, photo.hash);
    if (similarity === 'distinct') continue;
    if (!worst || distance < worst.distance) {
      worst = { against: photo, similarity, distance };
    }
  }

  return worst;
}
