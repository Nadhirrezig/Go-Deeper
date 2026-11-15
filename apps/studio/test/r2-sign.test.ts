import { describe, expect, it } from "vitest";
import { encodePath, encodeRfc3986, presignUrl } from "../lib/r2/sign";

const credentials = { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" };
const now = new Date("2026-11-15T10:00:00Z");

describe("presignUrl", () => {
  it("signs a read exactly like goexperience's production signer (src/lib/r2.ts)", () => {
    // Computed with goexperience's presignR2GetUrl for the same key, keys and time.
    const fromGoexperience =
      "https://acc123.r2.cloudflarestorage.com/goexperience/flipbooks/89dbed3b-e38f-43be-9285-70e0331ede20/manifest.json" +
      "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIDTEST%2F20261115%2Fauto%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20261115T100000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host" +
      "&X-Amz-Signature=687185720f257617942c7ec3a41a9d7f235757d67602ef7c7fad473e2a55a3b0";
    const url = presignUrl({
      method: "GET",
      origin: "https://acc123.r2.cloudflarestorage.com",
      path: "/goexperience/flipbooks/89dbed3b-e38f-43be-9285-70e0331ede20/manifest.json",
      credentials,
      now,
    });
    expect(url).toBe(fromGoexperience);
  });

  it("matches AWS's documented presigned GET example", () => {
    // AWS S3 docs, "Authenticating Requests: Using Query Parameters" (example keys).
    const url = presignUrl({
      method: "GET",
      origin: "https://examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
      region: "us-east-1",
      expiresIn: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("signs the method: a PUT and a DELETE of the same key get other signatures", () => {
    const sign = (method: "GET" | "PUT" | "DELETE") =>
      new URL(
        presignUrl({ method, origin: "https://a.example", path: "/b/k", credentials, now }),
      ).searchParams.get("X-Amz-Signature");
    expect(new Set([sign("GET"), sign("PUT"), sign("DELETE")]).size).toBe(3);
  });

  it("puts request parameters in the signed query, sorted and encoded", () => {
    const url = presignUrl({
      method: "GET",
      origin: "https://a.example",
      path: "/goexperience",
      query: { prefix: "flipbooks/x y/", "list-type": "2" },
      credentials,
      now,
    });
    const query = url.split("?")[1]!;
    expect(query.startsWith("X-Amz-Algorithm=")).toBe(true);
    expect(query).toContain("&list-type=2&prefix=flipbooks%2Fx%20y%2F&X-Amz-Signature=");
  });
});

describe("encoding", () => {
  it("encodes as RFC 3986 requires", () => {
    expect(encodeRfc3986("a b!*'()~")).toBe("a%20b%21%2A%27%28%29~");
  });

  it("encodes each path segment and keeps the separators", () => {
    expect(encodePath("flipbooks/a b/pages/001.webp")).toBe("flipbooks/a%20b/pages/001.webp");
  });
});
