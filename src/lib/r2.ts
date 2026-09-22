/**
 * Cloudflare R2 access. SERVER ONLY.
 *
 * The bucket is private and has no public URL (hard rule 2). Everything goes
 * through presigned URLs minted here, which are:
 *   - scoped to exactly one object key
 *   - scoped to one method (PUT to upload, GET to play)
 *   - valid for minutes, not hours
 *
 * R2 credentials never leave the server. The browser receives only the signed
 * URL, which grants nothing beyond that one object.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function assertServer() {
  if (typeof window !== 'undefined') {
    throw new Error('src/lib/r2.ts was loaded in the browser.');
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let cached: S3Client | null = null;

function client(): S3Client {
  assertServer();
  if (cached) return cached;

  cached = new S3Client({
    region: 'auto',
    endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  });
  return cached;
}

function bucket(): string {
  return required('R2_BUCKET');
}

function ttl(): number {
  const raw = Number(process.env.R2_SIGNED_URL_TTL_SECONDS ?? '300');
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

/**
 * Object key layout:
 *
 *   books/<bookId>/memories/<memoryId>/photo
 *   books/<bookId>/memories/<memoryId>/video
 *
 * Both ids are random UUIDs, so keys are unguessable even if the layout is
 * known. Listing the bucket is not possible without the R2 credentials.
 */
export function photoKey(bookId: string, memoryId: string): string {
  return `books/${bookId}/memories/${memoryId}/photo`;
}

export function videoKey(bookId: string, memoryId: string): string {
  return `books/${bookId}/memories/${memoryId}/video`;
}

export function mindKey(bookId: string): string {
  return `books/${bookId}/targets.mind`;
}

/** Presigned PUT for a direct browser upload. */
export async function signUpload(
  key: string,
  contentType: string,
): Promise<string> {
  assertServer();
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: ttl() },
  );
}

/** Presigned GET for playback. Short-lived by design — do not cache it. */
export async function signDownload(key: string): Promise<string> {
  assertServer();
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: ttl() },
  );
}

export async function deleteObject(key: string): Promise<void> {
  assertServer();
  await client().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key }),
  );
}

export const signedUrlTtlSeconds = ttl;
