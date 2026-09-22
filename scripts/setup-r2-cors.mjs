/**
 * Applies the CORS rules R2 needs for direct browser uploads.
 *
 *   node scripts/setup-r2-cors.mjs [extra-origin ...]
 *
 * Without this, step 3 of the upload flow (browser PUTs straight to R2) is
 * blocked by the browser and the upload fails.
 *
 * Only the origins listed here may talk to the bucket from a browser, and even
 * then only with a valid presigned URL. CORS is not access control — the
 * signature is. This just stops the browser refusing the request.
 *
 * Needs an R2 API token with bucket-admin rights. A token limited to object
 * read/write can upload and download fine but cannot change bucket settings,
 * so this script prints dashboard instructions instead of failing obscurely.
 */
import { readFileSync } from 'node:fs';

import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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

const origins = ['http://localhost:3000', ...process.argv.slice(2)];

const rules = [
  {
    AllowedOrigins: origins,
    AllowedMethods: ['PUT', 'GET', 'HEAD'],
    AllowedHeaders: ['content-type'],
    ExposeHeaders: ['etag'],
    MaxAgeSeconds: 3600,
  },
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

console.log(`Bucket:  ${env.R2_BUCKET}`);
console.log(`Origins: ${origins.join(', ')}\n`);

try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: env.R2_BUCKET,
      CORSConfiguration: { CORSRules: rules },
    }),
  );
  const check = await s3.send(
    new GetBucketCorsCommand({ Bucket: env.R2_BUCKET }),
  );
  console.log('Applied:');
  console.log(JSON.stringify(check.CORSRules, null, 2));
  console.log(
    '\nWhen you deploy, re-run with the production origin appended:\n' +
      '  node scripts/setup-r2-cors.mjs https://your-app.vercel.app\n',
  );
} catch (err) {
  if (err?.Code !== 'AccessDenied') throw err;

  const dashboardJson = origins.map((o) => ({
    AllowedOrigins: [o],
    AllowedMethods: ['PUT', 'GET', 'HEAD'],
    AllowedHeaders: ['content-type'],
    ExposeHeaders: ['etag'],
    MaxAgeSeconds: 3600,
  }));

  console.error(
    'Access denied changing bucket settings.\n\n' +
      'Your R2 API token can read and write objects but not edit bucket\n' +
      'configuration. Two ways forward:\n\n' +
      '  A. Set it in the dashboard (quickest)\n' +
      `     Cloudflare dashboard > R2 > ${env.R2_BUCKET} > Settings >\n` +
      '     CORS Policy > Edit, and paste:\n\n' +
      JSON.stringify(dashboardJson, null, 2) +
      '\n\n' +
      '  B. Create an R2 API token with Admin Read & Write, put it in\n' +
      '     .env.local, and re-run this script.\n\n' +
      'Uploads will fail in the browser until one of these is done.\n',
  );
  process.exit(1);
}
