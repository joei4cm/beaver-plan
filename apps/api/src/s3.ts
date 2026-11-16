import { AwsClient } from "aws4fetch";
import type { Bindings } from "./env.js";

/**
 * S3-compatible object storage (Cloudflare R2 via S3 API tokens).
 *
 * Required (either S3_* or R2_* aliases):
 *   S3_ENDPOINT | R2_ACCOUNT_ID → https://{account}.r2.cloudflarestorage.com
 *   S3_ACCESS_KEY_ID | R2_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY | R2_SECRET_ACCESS_KEY
 *   S3_BUCKET | R2_BUCKET
 * Optional:
 *   S3_REGION | R2_REGION (default "auto")
 *   S3_PUBLIC_BASE_URL | R2_PUBLIC_BASE_URL (public CDN / custom domain)
 */

export type S3Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  publicBaseUrl?: string;
};

export class S3ConfigError extends Error {
  constructor(message = "S3 / R2 credentials are not configured") {
    super(message);
    this.name = "S3ConfigError";
  }
}

function firstDefined(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

export function resolveS3Config(env: Bindings): S3Config | null {
  const accessKeyId = firstDefined(env.S3_ACCESS_KEY_ID, env.R2_ACCESS_KEY_ID);
  const secretAccessKey = firstDefined(
    env.S3_SECRET_ACCESS_KEY,
    env.R2_SECRET_ACCESS_KEY,
  );
  const bucket = firstDefined(env.S3_BUCKET, env.R2_BUCKET);
  const region = firstDefined(env.S3_REGION, env.R2_REGION) ?? "auto";
  const publicBaseUrl = firstDefined(
    env.S3_PUBLIC_BASE_URL,
    env.R2_PUBLIC_BASE_URL,
  );

  let endpoint = firstDefined(env.S3_ENDPOINT);
  if (!endpoint) {
    const accountId = firstDefined(env.R2_ACCOUNT_ID);
    if (accountId) {
      endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    }
  }

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
    publicBaseUrl: publicBaseUrl?.replace(/\/$/, ""),
  };
}

export function isS3Configured(env: Bindings): boolean {
  return resolveS3Config(env) !== null;
}

export function requireS3Config(env: Bindings): S3Config {
  const cfg = resolveS3Config(env);
  if (!cfg) {
    throw new S3ConfigError(
      "Set S3_ENDPOINT (or R2_ACCOUNT_ID), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET (R2_* aliases accepted). See README → Media / R2 (S3 API).",
    );
  }
  return cfg;
}

export function mediaMissingResponse(c: {
  json: (body: unknown, status?: number) => Response;
}) {
  return c.json(
    {
      error: "s3_not_configured",
      message:
        "Object storage is required for journal/share media. Set S3_ENDPOINT (or R2_ACCOUNT_ID), S3_ACCESS_KEY_ID (or R2_ACCESS_KEY_ID), S3_SECRET_ACCESS_KEY (or R2_SECRET_ACCESS_KEY), and S3_BUCKET (or R2_BUCKET) in apps/api/.dev.vars — or wrangler secret put …. Region defaults to auto for Cloudflare R2.",
      docs: "See README → Media / R2 (S3 API)",
      aliases: {
        S3_ENDPOINT: "or R2_ACCOUNT_ID → https://{account}.r2.cloudflarestorage.com",
        S3_ACCESS_KEY_ID: "or R2_ACCESS_KEY_ID",
        S3_SECRET_ACCESS_KEY: "or R2_SECRET_ACCESS_KEY",
        S3_BUCKET: "or R2_BUCKET",
        S3_REGION: "or R2_REGION (default auto)",
      },
    },
    503,
  );
}

function awsClient(cfg: S3Config): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: cfg.region,
  });
}

function objectUrl(cfg: S3Config, key: string): string {
  return `${cfg.endpoint}/${cfg.bucket}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export async function putObject(
  cfg: S3Config,
  input: { key: string; body: Uint8Array | ArrayBuffer; contentType: string },
): Promise<void> {
  const client = awsClient(cfg);
  const res = await client.fetch(objectUrl(cfg, input.key), {
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
    },
    body: input.body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`s3_put_failed:${res.status}:${text.slice(0, 200)}`);
  }
}

export async function getObject(
  cfg: S3Config,
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const client = awsClient(cfg);
  const res = await client.fetch(objectUrl(cfg, key), { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`s3_get_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType =
    res.headers.get("content-type") ?? "application/octet-stream";
  return { body: buf, contentType };
}

/** Presigned PUT — client uploads directly to R2/S3 (configure bucket CORS). */
export async function signedPutUrl(
  cfg: S3Config,
  input: { key: string; contentType: string; expiresInSec?: number },
): Promise<string> {
  const client = awsClient(cfg);
  const expires = input.expiresInSec ?? 900;
  const url = `${objectUrl(cfg, input.key)}?X-Amz-Expires=${expires}`;
  const signed = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": input.contentType },
    }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

/** Presigned GET — temporary download URL. */
export async function signedGetUrl(
  cfg: S3Config,
  input: { key: string; expiresInSec?: number },
): Promise<string> {
  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl}/${input.key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  }
  const client = awsClient(cfg);
  const expires = input.expiresInSec ?? 3600;
  const url = `${objectUrl(cfg, input.key)}?X-Amz-Expires=${expires}`;
  const signed = await client.sign(
    new Request(url, { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}
