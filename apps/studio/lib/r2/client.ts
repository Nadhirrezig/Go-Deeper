import { R2Error } from "./errors";
import { encodePath, presignUrl } from "./sign";
import type { SigningCredentials } from "./sign";

/**
 * Cloudflare R2 client for the studio: write, delete and list objects in the private bucket
 * that goexperience.travel reads. Requests are signed with node:crypto (lib/r2/sign.ts); no SDK.
 * Server code only: it needs the R2 keys from the office PC's .env.
 */

export interface R2Config {
  /** Scheme and host of the S3 API, e.g. https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  credentials: SigningCredentials;
}

export interface R2Object {
  key: string;
  size: number;
}

export interface R2Client {
  /** `body` is backed by a plain ArrayBuffer (a Buffer from readFile, a new Uint8Array), as fetch requires. */
  putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>;
  /** Succeeds when the object is already gone. */
  deleteObject(key: string): Promise<void>;
  /** Every object whose key starts with `prefix`, across result pages. */
  listObjects(prefix: string): Promise<R2Object[]>;
}

export interface R2ClientDeps {
  fetch?: typeof fetch;
  /** Waits between retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/**
 * R2 settings from the environment (the repo-root .env, loaded by next.config.ts).
 * Throws NOT_CONFIGURED naming the missing variables.
 */
export function r2ConfigFromEnv(env: Record<string, string | undefined> = process.env): R2Config {
  const read = (name: string) => env[name]?.trim() || undefined;
  const accountId = read("R2_ACCOUNT_ID");
  const accessKeyId = read("R2_ACCESS_KEY_ID");
  const secretAccessKey = read("R2_SECRET_ACCESS_KEY");
  const endpoint =
    read("R2_ENDPOINT") ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  const missing = [
    !endpoint && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new R2Error("NOT_CONFIGURED", `Missing environment variables: ${missing.join(", ")}`);
  }
  return {
    endpoint,
    bucket: read("R2_BUCKET") ?? "goexperience",
    credentials: { accessKeyId, secretAccessKey },
  };
}

/** Attempts per request: R2 occasionally drops a connection under a burst of requests. */
const ATTEMPTS = 3;
const RETRY_BASE_MS = 200;

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};
const decodeXml = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);

const xmlValue = (xml: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeXml(match[1]!) : undefined;
};

/** Keys and sizes of one ListObjectsV2 result page, and the token of the next page. */
export function parseListPage(xml: string): { objects: R2Object[]; nextToken?: string } {
  const objects: R2Object[] = [];
  for (const [, contents] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = xmlValue(contents!, "Key");
    const size = Number(xmlValue(contents!, "Size"));
    if (key !== undefined) objects.push({ key, size: Number.isFinite(size) ? size : 0 });
  }
  const truncated = xmlValue(xml, "IsTruncated") === "true";
  return { objects, nextToken: truncated ? xmlValue(xml, "NextContinuationToken") : undefined };
}

export function createR2Client(config: R2Config, deps: R2ClientDeps = {}): R2Client {
  const doFetch = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => new Date());
  const bucketPath = `/${encodePath(config.bucket)}`;

  const url = (method: "GET" | "PUT" | "DELETE", key?: string, query?: Record<string, string>) =>
    presignUrl({
      method,
      origin: config.endpoint,
      path: key === undefined ? bucketPath : `${bucketPath}/${encodePath(key)}`,
      query,
      credentials: config.credentials,
      now: now(),
    });

  /**
   * One request, retried on network failures and 5xx answers. Each attempt is signed afresh.
   * `ok` lists the statuses that count as success besides 2xx (DELETE of a missing object).
   */
  async function request(
    describe: string,
    makeUrl: () => string,
    init: RequestInit,
    ok: readonly number[] = [],
  ): Promise<Response> {
    let lastError: R2Error | undefined;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      let response: Response;
      try {
        response = await doFetch(makeUrl(), init);
      } catch (error) {
        lastError = new R2Error("NETWORK", `${describe}: ${String(error)}`);
        continue;
      }
      if (response.ok || ok.includes(response.status)) return response;
      const body = (await response.text().catch(() => "")).slice(0, 300);
      const detail = `${describe}: R2 answered ${response.status} ${body}`.trim();
      if (response.status === 401 || response.status === 403) {
        throw new R2Error("ACCESS_DENIED", detail, response.status);
      }
      lastError = new R2Error("UPSTREAM", detail, response.status);
      if (response.status < 500) break; // a 4xx will not change on a retry
    }
    throw lastError ?? new R2Error("UPSTREAM", `${describe}: no answer`);
  }

  return {
    async putObject(key, body, contentType) {
      await request(`PUT ${key}`, () => url("PUT", key), {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body,
      });
    },

    async deleteObject(key) {
      await request(`DELETE ${key}`, () => url("DELETE", key), { method: "DELETE" }, [404]);
    },

    async listObjects(prefix) {
      const objects: R2Object[] = [];
      let token: string | undefined;
      do {
        const query: Record<string, string> = { "list-type": "2", prefix };
        if (token) query["continuation-token"] = token;
        const response = await request(`LIST ${prefix}`, () => url("GET", undefined, query), {
          method: "GET",
        });
        const page = parseListPage(await response.text());
        objects.push(...page.objects);
        token = page.nextToken;
      } while (token);
      return objects;
    },
  };
}
