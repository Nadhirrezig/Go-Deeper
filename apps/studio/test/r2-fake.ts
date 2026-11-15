/**
 * In-memory stand-in for the R2 S3 API, used as `fetch` by the R2 tests. It serves presigned
 * path-style URLs (/<bucket>/<key>): GET, PUT, DELETE, and ListObjectsV2 (GET /<bucket>?list-type=2).
 * Unsigned requests get 403. `failNext` queues statuses (or "network") for the next requests.
 */
export interface FakeR2 {
  fetch: typeof fetch;
  objects: Map<string, { body: Uint8Array<ArrayBuffer>; contentType: string }>;
  /** Every request, in order: "PUT flipbooks/…", "DELETE …", "LIST <prefix>". */
  log: string[];
  failNext: (number | "network")[];
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function createFakeR2(options: { bucket?: string; pageSize?: number } = {}): FakeR2 {
  const bucket = options.bucket ?? "goexperience";
  const pageSize = options.pageSize ?? 1000;
  const objects = new Map<string, { body: Uint8Array<ArrayBuffer>; contentType: string }>();
  const log: string[] = [];
  const failNext: (number | "network")[] = [];

  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init.method ?? "GET";
    const failure = failNext.shift();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure !== undefined) return new Response("injected", { status: failure });
    if (!url.searchParams.get("X-Amz-Signature")) return new Response("unsigned", { status: 403 });

    const segments = url.pathname.split("/").slice(1).map(decodeURIComponent);
    if (segments[0] !== bucket) return new Response("NoSuchBucket", { status: 404 });
    const key = segments.slice(1).join("/");

    if (method === "GET" && key === "" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = Number(url.searchParams.get("continuation-token") ?? 0);
      const page = all.slice(start, start + pageSize);
      log.push(`LIST ${prefix}`);
      const truncated = start + pageSize < all.length;
      const contents = page
        .map(
          (k) =>
            `<Contents><Key>${escapeXml(k)}</Key><Size>${objects.get(k)!.body.byteLength}</Size></Contents>`,
        )
        .join("");
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name>` +
        `<Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount>` +
        `<IsTruncated>${truncated}</IsTruncated>${contents}` +
        (truncated ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : "") +
        `</ListBucketResult>`;
      return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
    }
    if (method === "PUT" && key) {
      const body = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
      const contentType = new Headers(init.headers).get("content-type") ?? "";
      objects.set(key, { body, contentType });
      log.push(`PUT ${key}`);
      return new Response(null, { status: 200 });
    }
    if (method === "GET" && key) {
      const object = objects.get(key);
      log.push(`GET ${key}`);
      if (!object) return new Response("NoSuchKey", { status: 404 });
      return new Response(object.body, {
        status: 200,
        headers: { "Content-Type": object.contentType },
      });
    }
    if (method === "DELETE" && key) {
      objects.delete(key);
      log.push(`DELETE ${key}`);
      return new Response(null, { status: 204 });
    }
    return new Response("unsupported", { status: 400 });
  };

  return { fetch: fakeFetch as typeof fetch, objects, log, failNext };
}
