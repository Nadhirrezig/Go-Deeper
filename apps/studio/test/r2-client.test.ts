import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createR2Client, parseListPage, r2ConfigFromEnv } from "../lib/r2/client";
import type { R2Config } from "../lib/r2/client";
import { isR2Error } from "../lib/r2/errors";
import type { R2Error } from "../lib/r2/errors";
import { createFakeR2 } from "./r2-fake";

const config: R2Config = {
  endpoint: "https://acc123.r2.cloudflarestorage.com",
  bucket: "goexperience",
  credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" },
};
const noSleep = async () => {};

const errorOf = async (promise: Promise<unknown>): Promise<R2Error> => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isR2Error(error)).toBe(true);
  return error as R2Error;
};

describe("r2ConfigFromEnv", () => {
  it("builds the endpoint from the account id and defaults the bucket", () => {
    const env = { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" };
    expect(r2ConfigFromEnv(env)).toEqual({
      endpoint: "https://acc.r2.cloudflarestorage.com",
      bucket: "goexperience",
      credentials: { accessKeyId: "id", secretAccessKey: "secret" },
    });
  });

  it("takes R2_ENDPOINT and R2_BUCKET when set", () => {
    const config = r2ConfigFromEnv({
      R2_ENDPOINT: "http://127.0.0.1:9100",
      R2_BUCKET: "other",
      R2_ACCESS_KEY_ID: "id",
      R2_SECRET_ACCESS_KEY: "secret",
    });
    expect(config.endpoint).toBe("http://127.0.0.1:9100");
    expect(config.bucket).toBe("other");
  });

  it("names the missing variables, in French for the team", () => {
    let error: unknown;
    try {
      r2ConfigFromEnv({ R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: " " });
    } catch (e) {
      error = e;
    }
    expect(isR2Error(error)).toBe(true);
    expect((error as R2Error).code).toBe("NOT_CONFIGURED");
    expect((error as R2Error).detail).toBe(
      "Missing environment variables: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
    expect((error as R2Error).message).toMatch(/fichier \.env/);
  });
});

describe("createR2Client", () => {
  it("PUTs a signed, path-style request with the Content-Type and body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createR2Client(config, {
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 200 });
      }) as typeof fetch,
    });
    await client.putObject("flipbooks/x/pages/001.webp", new Uint8Array([1, 2]), "image/webp");
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(
      "https://acc123.r2.cloudflarestorage.com/goexperience/flipbooks/x/pages/001.webp",
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0]!.init.method).toBe("PUT");
    expect(new Headers(calls[0]!.init.headers).get("content-type")).toBe("image/webp");
    expect(calls[0]!.init.body).toEqual(new Uint8Array([1, 2]));
  });

  it("retries a 503 and a dropped connection, then succeeds", async () => {
    const r2 = createFakeR2();
    r2.failNext.push(503, "network");
    const client = createR2Client(config, { fetch: r2.fetch, sleep: noSleep });
    await client.putObject("a.json", new Uint8Array([1]), "application/json");
    expect(r2.objects.has("a.json")).toBe(true);
  });

  it("gives up after 3 attempts with NETWORK", async () => {
    const r2 = createFakeR2();
    r2.failNext.push("network", "network", "network");
    const client = createR2Client(config, { fetch: r2.fetch, sleep: noSleep });
    const error = await errorOf(client.putObject("a.json", new Uint8Array([1]), "x"));
    expect(error.code).toBe("NETWORK");
  });

  it("stops at once on refused keys (403) with ACCESS_DENIED", async () => {
    const r2 = createFakeR2();
    r2.failNext.push(403);
    const client = createR2Client(config, { fetch: r2.fetch, sleep: noSleep });
    const error = await errorOf(client.putObject("a.json", new Uint8Array([1]), "x"));
    expect(error).toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect(r2.failNext).toEqual([]);
    expect(r2.objects.size).toBe(0);
  });

  it("does not retry another 4xx", async () => {
    const r2 = createFakeR2();
    r2.failNext.push(400);
    const client = createR2Client(config, { fetch: r2.fetch, sleep: noSleep });
    const error = await errorOf(client.putObject("a.json", new Uint8Array([1]), "x"));
    expect(error).toMatchObject({ code: "UPSTREAM", status: 400 });
    expect(r2.objects.size).toBe(0);
  });

  it("treats deleting a missing object as done", async () => {
    const r2 = createFakeR2();
    r2.failNext.push(404);
    const client = createR2Client(config, { fetch: r2.fetch, sleep: noSleep });
    await expect(client.deleteObject("gone.json")).resolves.toBeUndefined();
  });

  it("lists across result pages", async () => {
    const r2 = createFakeR2({ pageSize: 2 });
    const client = createR2Client(config, { fetch: r2.fetch });
    for (const key of ["p/a", "p/b", "p/c", "p/d", "p/e", "q/a"]) {
      await client.putObject(key, new Uint8Array(key.length), "x");
    }
    const listed = await client.listObjects("p/");
    expect(listed.map((o) => o.key)).toEqual(["p/a", "p/b", "p/c", "p/d", "p/e"]);
    expect(listed.every((o) => o.size === 3)).toBe(true);
    expect(r2.log.filter((line) => line.startsWith("LIST")).length).toBe(3);
  });
});

describe("over HTTP with Node's own fetch", () => {
  it("sends the body and Content-Type, and reads a listing", async () => {
    const received: { method?: string; url?: string; type?: string; body: Buffer }[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received.push({
          method: req.method,
          url: req.url,
          type: req.headers["content-type"],
          body: Buffer.concat(chunks),
        });
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/xml");
          res.end(
            "<ListBucketResult><IsTruncated>false</IsTruncated>" +
              "<Contents><Key>flipbooks/x/manifest.json</Key><Size>4</Size></Contents></ListBucketResult>",
          );
        } else res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const client = createR2Client({ ...config, endpoint: `http://127.0.0.1:${port}` });
      await client.putObject("flipbooks/x/manifest.json", Buffer.from("{}\n!"), "application/json");
      const listed = await client.listObjects("flipbooks/x/");

      expect(received[0]).toMatchObject({ method: "PUT", type: "application/json" });
      expect(received[0]!.url).toMatch(/^\/goexperience\/flipbooks\/x\/manifest\.json\?X-Amz-/);
      expect(received[0]!.body.toString()).toBe("{}\n!");
      expect(received[1]!.url).toMatch(
        /^\/goexperience\?X-Amz-.*&list-type=2&prefix=flipbooks%2Fx%2F/,
      );
      expect(listed).toEqual([{ key: "flipbooks/x/manifest.json", size: 4 }]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("parseListPage", () => {
  it("reads keys, sizes, XML entities and the next page token", () => {
    const xml =
      "<ListBucketResult><IsTruncated>true</IsTruncated>" +
      "<Contents><Key>a&amp;b.json</Key><Size>12</Size></Contents>" +
      "<Contents><Key>c.webp</Key><Size>3</Size></Contents>" +
      "<NextContinuationToken>tok/en+=</NextContinuationToken></ListBucketResult>";
    expect(parseListPage(xml)).toEqual({
      objects: [
        { key: "a&b.json", size: 12 },
        { key: "c.webp", size: 3 },
      ],
      nextToken: "tok/en+=",
    });
  });

  it("has no next token on the last page", () => {
    expect(
      parseListPage("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>"),
    ).toEqual({ objects: [], nextToken: undefined });
  });
});
