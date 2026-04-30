/**
 * Cloudflare R2 client — thin wrapper around the AWS S3 SDK.
 *
 * R2 is S3-compatible. We point the AWS SDK at the R2 endpoint and
 * use the `auto` region (R2 ignores the region but the SDK requires
 * one).
 *
 * Required env vars (validated by `loadR2Config`):
 *   - R2_ENDPOINT          e.g. https://<account_id>.r2.cloudflarestorage.com
 *   - R2_BUCKET            e.g. r2mybeez
 *   - R2_ACCESS_KEY_ID
 *   - R2_SECRET_ACCESS_KEY
 *
 * Optional:
 *   - R2_PREFIX            object key prefix (default `mybeezdb/`)
 *
 * Streams uploads via `@aws-sdk/lib-storage` so multi-GB dumps work
 * without buffering in memory.
 */

import {
  S3Client,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  GetObjectCommand,
  DeleteObjectsCommand,
  type _Object,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export interface R2Config {
  endpoint: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function loadR2Config(env: NodeJS.ProcessEnv = process.env): R2Config {
  const endpoint = env.R2_ENDPOINT;
  const bucket = env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const prefix = env.R2_PREFIX ?? "mybeezdb/";

  const missing: string[] = [];
  if (!endpoint) missing.push("R2_ENDPOINT");
  if (!bucket) missing.push("R2_BUCKET");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  if (!prefix.endsWith("/")) {
    throw new Error(`R2_PREFIX must end with '/', got ${JSON.stringify(prefix)}`);
  }

  return {
    endpoint: endpoint!,
    bucket: bucket!,
    prefix,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  };
}

export function makeR2Client(cfg: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/**
 * Streams an upload to R2. Returns the ETag of the resulting object.
 *
 * Handles multi-part automatically when the body exceeds the threshold
 * (lib-storage default). 4 parallel parts.
 */
export async function uploadStream(
  client: S3Client,
  bucket: string,
  key: string,
  body: Readable | NodeReadableStream | Buffer,
  contentType = "application/gzip",
): Promise<{ etag: string | undefined }> {
  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: body as never, ContentType: contentType },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
  });
  const result = await upload.done();
  return { etag: (result as { ETag?: string }).ETag };
}

/**
 * Lists every key under `prefix`. Handles pagination transparently.
 * Returns the raw `_Object` records so the caller can decide what to
 * do with sizes / timestamps.
 */
export async function listObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<_Object[]> {
  const out: _Object[] = [];
  let token: string | undefined = undefined;
  do {
    const resp: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    if (resp.Contents) out.push(...resp.Contents);
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * Downloads `key` from `bucket` and returns the body as a Node
 * Readable stream (consumed by the caller, e.g. piped into gunzip +
 * psql).
 */
export async function downloadStream(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Readable> {
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) {
    throw new Error(`R2 GetObject(${key}) returned empty body`);
  }
  return resp.Body as Readable;
}

/**
 * Deletes a batch of keys. R2 supports up to 1000 per call. We chunk
 * defensively; in practice retention sweeps never hit that limit.
 */
export async function deleteObjects(
  client: S3Client,
  bucket: string,
  keys: string[],
): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
