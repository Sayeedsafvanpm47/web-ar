/**
 * Checks that the R2 credentials in .env.local can actually do the four things
 * the app needs. Run it after changing an R2 token.
 *
 *   node scripts/verify-r2.mjs
 *
 * The PUT here goes from Node, not a browser, so CORS is not involved. That
 * separation matters: a browser upload can fail either because the token
 * cannot write or because CORS is unset, and the two look identical from the
 * front end.
 */
import { readFileSync } from 'node:fs';

import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function loadEnv(path = '.env.local') {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv();
for (const k of [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
]) {
  if (!env[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

const Bucket = env.R2_BUCKET;
const Key = '_verify-r2.txt';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

let failed = 0;
const report = (label, ok, detail = '') =>
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);

console.log(`\nBucket: ${Bucket}\n`);

try {
  await s3.send(new HeadBucketCommand({ Bucket }));
  report('bucket reachable', true);
} catch (e) {
  report('bucket reachable', false, e.name);
  failed++;
}

let uploaded = false;
try {
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket, Key, ContentType: 'text/plain' }),
    { expiresIn: 300 },
  );
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: 'verify',
  });
  uploaded = res.ok;
  report(
    'presigned PUT (token can write)',
    res.ok,
    res.ok ? '' : `HTTP ${res.status} — token likely lacks write permission`,
  );
  if (!res.ok) failed++;
} catch (e) {
  report('presigned PUT (token can write)', false, e.name);
  failed++;
}

if (uploaded) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket, Key }));
    report('delete (cleanup)', true);
  } catch (e) {
    report('delete (cleanup)', false, `${e.name} — ${Key} left behind`);
    failed++;
  }
}

try {
  const cors = await s3.send(new GetBucketCorsCommand({ Bucket }));
  const origins = cors.CORSRules?.flatMap((r) => r.AllowedOrigins ?? []) ?? [];
  const hasLocal = origins.includes('http://localhost:3000') || origins.includes('*');
  report('CORS configured', hasLocal, `origins: ${origins.join(', ') || 'none'}`);
  if (!hasLocal) failed++;
} catch {
  report(
    'CORS configured',
    false,
    'not set — browser uploads will be blocked; see scripts/setup-r2-cors.mjs',
  );
  failed++;
}

console.log(
  failed === 0
    ? '\nAll checks passed. Browser uploads should work.\n'
    : `\n${failed} check(s) failed.\n`,
);
process.exit(failed === 0 ? 0 : 1);
