/**
 * Files storage — thin wrapper over the existing `scripts/_lib/r2.ts`
 * S3 client, scoped to the `files/<tenantId>/` keyspace (distinct from
 * the backups namespace at `mybeezdb/`).
 *
 * The R2 client is built once and cached. If R2 env vars are missing,
 * `getR2()` throws on first use (boot proceeds, the failure surfaces
 * the moment a route actually tries to upload/download).
 */

import type { S3Client } from "@aws-sdk/client-s3";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { loadR2Config, makeR2Client, uploadStream } from "../../../scripts/_lib/r2";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("FilesStorage");

interface R2Cache {
  client: S3Client;
  bucket: string;
}

let cached: R2Cache | null = null;

function getR2(): R2Cache {
  if (cached) return cached;
  const cfg = loadR2Config();
  cached = { client: makeR2Client(cfg), bucket: cfg.bucket };
  return cached;
}

/** Test-only: lets vitest reset between cases. */
export function _resetR2Cache(): void {
  cached = null;
}

/**
 * Uploads a buffer to R2 at `key`. Returns the same key for storage in
 * the DB row's `storagePath` column.
 */
export async function uploadFileToStorage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { client, bucket } = getR2();
  await uploadStream(client, bucket, key, body, contentType);
  return key;
}

/** Returns a Readable for the object at `key`. Caller pipes to the response. */
export async function downloadFileFromStorage(key: string): Promise<Readable> {
  const { client, bucket } = getR2();
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) throw new Error(`R2 GetObject(${key}) returned empty body`);
  return resp.Body as Readable;
}

/**
 * Downloads `key` and collects the full body into a Buffer. Used by the
 * email-bulk hook (Resend attachments must be in-memory). Callers should
 * cap aggregate size before invoking this — the function does not enforce
 * a per-object limit and will gladly buffer multi-MB blobs.
 */
export async function downloadFileBufferFromStorage(key: string): Promise<Buffer> {
  const stream = await downloadFileFromStorage(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Deletes one object. Used by the trash purge and by the hard-delete
 * route. Fails-soft: a missing object logs and returns (the row delete
 * still happens — we don't want a stuck trash row because the file was
 * already gone).
 */
export async function deleteFileFromStorage(key: string): Promise<void> {
  try {
    const { client, bucket } = getR2();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    log.error({ err, key }, "deleteFileFromStorage failed");
  }
}

/** Returns true iff the object exists in R2. Used in tests / recovery tooling. */
export async function storageObjectExists(key: string): Promise<boolean> {
  try {
    const { client, bucket } = getR2();
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
