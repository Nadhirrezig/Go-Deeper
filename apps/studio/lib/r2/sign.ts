import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature V4 query signing ("presigned URLs") with node:crypto only, as goexperience's
 * src/lib/r2.ts does for its reads: the same algorithm, extended to any method and to query
 * parameters (ListObjectsV2). The payload is not signed (UNSIGNED-PAYLOAD) and only `host` is a
 * signed header, so a request may carry Content-Type and a body freely.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

export interface SigningCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PresignInput {
  method: "GET" | "PUT" | "DELETE";
  /** Scheme and host, e.g. https://<account>.r2.cloudflarestorage.com */
  origin: string;
  /** Path as sent, already encoded with `encodePath`, e.g. /goexperience/flipbooks/<id>/manifest.json */
  path: string;
  /** Request parameters (e.g. list-type, prefix); the X-Amz-* ones are added here. */
  query?: Record<string, string>;
  credentials: SigningCredentials;
  /** R2 ignores the region, but SigV4 requires one in the credential scope. */
  region?: string;
  /** Seconds the URL stays valid. */
  expiresIn?: number;
  now?: Date;
}

/** RFC 3986 encoding, as SigV4 wants it (encodeURIComponent leaves !'()* alone). */
export const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Each segment of an object key encoded, the separators kept. */
export const encodePath = (path: string): string => path.split("/").map(encodeRfc3986).join("/");

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

const sha256Hex = (data: string): string => createHash("sha256").update(data, "utf8").digest("hex");

/** Canonical query string: names and values encoded, sorted by name. */
const canonicalQuery = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");

/** A signed URL for one request. */
export function presignUrl(input: PresignInput): string {
  const { method, origin, path, credentials } = input;
  const region = input.region ?? "auto";
  const { host } = new URL(origin);

  // SigV4 wants a basic-format timestamp: YYYYMMDDTHHMMSSZ
  const amzDate = (input.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const query = canonicalQuery({
    ...input.query,
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresIn ?? 300),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalRequest = [
    method,
    path,
    query,
    `host:${host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `${new URL(origin).origin}${path}?${query}&X-Amz-Signature=${signature}`;
}
