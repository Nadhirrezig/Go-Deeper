import type { FlipbookManifest } from "@vipgroup/shared";
import { describe, expect, it } from "vitest";
import {
  assertManifest,
  FlipbookError,
  manifestBase,
  resolveBook,
  resolveUrl,
} from "../src/manifest";
import { makeManifest } from "./helpers";

describe("path resolution", () => {
  const manifestUrl = "https://cdn.example.com/flipbooks/abc/manifest.json";

  it("resolves relative paths against the manifest URL", () => {
    expect(resolveUrl("pages/001.webp", manifestUrl)).toBe(
      "https://cdn.example.com/flipbooks/abc/pages/001.webp",
    );
    expect(resolveUrl("original.pdf", manifestUrl)).toBe(
      "https://cdn.example.com/flipbooks/abc/original.pdf",
    );
  });

  it("keeps absolute URLs and resolves root-relative ones on the manifest's origin", () => {
    expect(resolveUrl("https://other.example.com/x.webp", manifestUrl)).toBe(
      "https://other.example.com/x.webp",
    );
    expect(resolveUrl("/shared/x.webp", manifestUrl)).toBe("https://cdn.example.com/shared/x.webp");
  });

  it("makes a relative manifest URL absolute with the document URL", () => {
    expect(
      manifestBase(
        { manifestUrl: "/files/abc/manifest.json" },
        "http://192.168.1.20:3000/dev/books/abc",
      ),
    ).toBe("http://192.168.1.20:3000/files/abc/manifest.json");
  });

  it("treats baseUrl as a folder, with or without a trailing slash", () => {
    const doc = "https://site.example.com/page";
    expect(manifestBase({ baseUrl: "https://cdn.example.com/flipbooks/abc" }, doc)).toBe(
      "https://cdn.example.com/flipbooks/abc/",
    );
    expect(manifestBase({ baseUrl: "https://cdn.example.com/flipbooks/abc/" }, doc)).toBe(
      "https://cdn.example.com/flipbooks/abc/",
    );
    expect(manifestBase({ baseUrl: "/files/abc" }, doc)).toBe(
      "https://site.example.com/files/abc/",
    );
  });

  it("resolves every path of a manifest", () => {
    const book = resolveBook(makeManifest(3), manifestUrl);
    expect(book.pageCount).toBe(3);
    expect(book.pdf).toBe("https://cdn.example.com/flipbooks/abc/original.pdf");
    expect(book.search).toBe("https://cdn.example.com/flipbooks/abc/search.json");
    expect(book.pages[1]).toEqual({
      n: 2,
      thumb: "https://cdn.example.com/flipbooks/abc/pages/002-thumb.webp",
      standard: "https://cdn.example.com/flipbooks/abc/pages/002.webp",
      zoom: "https://cdn.example.com/flipbooks/abc/pages/002-zoom.webp",
    });
  });
});

describe("assertManifest", () => {
  it("accepts a version 1 manifest", () => {
    expect(assertManifest(makeManifest(2)).pageCount).toBe(2);
  });

  it("rejects any other version with the 'version' code", () => {
    const future = { ...makeManifest(2), version: 2 } as unknown as FlipbookManifest;
    expect(() => assertManifest(future)).toThrowError(FlipbookError);
    try {
      assertManifest(future);
    } catch (error) {
      expect((error as FlipbookError).code).toBe("version");
    }
  });

  it("rejects broken data with the 'load' code", () => {
    for (const bad of [null, "text", { version: 1 }, { ...makeManifest(1), pages: [] }]) {
      try {
        assertManifest(bad);
        expect.unreachable();
      } catch (error) {
        expect((error as FlipbookError).code).toBe("load");
      }
    }
  });
});
