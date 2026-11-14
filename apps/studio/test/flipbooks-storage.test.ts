import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "../app/files/[...path]/route";
import { getStorageDir, listBooks, resolveStorageFile } from "../lib/flipbooks-storage";

let work: string;
let storage: string;
/** Creating symbolic links needs admin rights or Developer Mode on Windows. */
let canSymlink = true;

const manifest = (title: string, createdAt: string) => ({
  version: 1,
  id: "book-a",
  slug: "book-a",
  title,
  pageCount: 2,
  pageWidth: 1000,
  pageHeight: 1414,
  pdf: "original.pdf",
  search: "search.json",
  pages: [],
  createdAt,
});

beforeAll(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-studio-"));
  storage = path.join(work, "storage", "flipbooks");
  await mkdir(path.join(storage, "book-a", "pages"), { recursive: true });
  await mkdir(path.join(storage, "book-b"), { recursive: true });
  await mkdir(path.join(storage, "book-c.tmp"), { recursive: true });
  await writeFile(
    path.join(storage, "book-a", "manifest.json"),
    JSON.stringify(manifest("Livre A", "2026-11-01T10:00:00.000Z")),
  );
  await writeFile(
    path.join(storage, "book-b", "manifest.json"),
    JSON.stringify({ ...manifest("Livre B", "2026-11-10T10:00:00.000Z"), id: "book-b" }),
  );
  await writeFile(path.join(storage, "book-a", "pages", "001.webp"), Buffer.from("RIFFfakeWEBP"));
  await writeFile(path.join(storage, "book-a", "original.pdf"), Buffer.from("%PDF-1.4 fake"));
  await writeFile(path.join(storage, "book-a", "notes.txt"), "not a book file");
  // Files outside the storage folder that must never be reachable.
  await writeFile(path.join(work, "package.json"), '{"secret":true}');
  await writeFile(path.join(work, "storage", "secret.json"), '{"secret":true}');
  try {
    await symlink(path.join(work, "package.json"), path.join(storage, "book-a", "link.json"));
  } catch {
    canSymlink = false;
  }
  process.env.FLIPBOOKS_DIR = storage;
});

afterAll(async () => {
  delete process.env.FLIPBOOKS_DIR;
  await rm(work, { recursive: true, force: true });
});

/** Call the route handler the way Next.js does (params already URL-decoded once). */
const get = (segments: string[], headers?: Record<string, string>): Promise<Response> =>
  GET(new Request(`http://studio.test/files/${segments.join("/")}`, { headers }), {
    params: Promise.resolve({ path: segments }),
  });

describe("getStorageDir", () => {
  it("uses FLIPBOOKS_DIR when set, else <repo root>/storage/flipbooks", () => {
    expect(getStorageDir()).toBe(storage);
    delete process.env.FLIPBOOKS_DIR;
    try {
      const fallback = getStorageDir();
      expect(fallback.endsWith(path.join("storage", "flipbooks"))).toBe(true);
      // The test runs from apps/studio: the default must still point at the repo root.
      expect(fallback).not.toContain(path.join("apps", "studio"));
    } finally {
      process.env.FLIPBOOKS_DIR = storage;
    }
  });
});

describe("resolveStorageFile", () => {
  it("maps safe segments to a file inside the storage folder", () => {
    expect(resolveStorageFile(storage, ["book-a", "pages", "001.webp"])).toEqual({
      file: path.join(storage, "book-a", "pages", "001.webp"),
      contentType: "image/webp",
    });
    expect(resolveStorageFile(storage, ["book-a", "manifest.json"])?.contentType).toBe(
      "application/json; charset=utf-8",
    );
    expect(resolveStorageFile(storage, ["book-a", "original.pdf"])?.contentType).toBe(
      "application/pdf",
    );
  });

  it.each([
    [["..", "package.json"]],
    [["book-a", "..", "..", "secret.json"]],
    [["book-a", "pages", "..", "..", "..", "..", "package.json"]],
    [["%2e%2e", "package.json"]],
    [["%252e%252e", "package.json"]],
    [["..%2fpackage.json"]],
    [["../package.json"]],
    [["..\\package.json"]],
    [["book-a", "..\\..\\secret.json"]],
    [["/etc/passwd"]],
    [["", "etc", "passwd"]],
    [["C:", "Windows", "win.ini"]],
    [["book-a", "manifest.json\0.webp"]],
    [[".env"]],
    [["book-a", ".hidden.json"]],
    [["book-a", "notes.txt"]],
    [["book-a"]],
    [[]],
  ])("rejects %j", (segments) => {
    expect(resolveStorageFile(storage, segments)).toBeNull();
  });
});

describe("GET /files/[...path]", () => {
  it("serves book files with their content type and cache headers", async () => {
    const image = await get(["book-a", "pages", "001.webp"]);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
    expect(image.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(image.headers.get("content-length")).toBe("12");
    expect(Buffer.from(await image.arrayBuffer()).toString()).toBe("RIFFfakeWEBP");

    const json = await get(["book-a", "manifest.json"]);
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(json.headers.get("cache-control")).toBe("no-cache");
    expect((await json.json()).title).toBe("Livre A");

    const pdf = await get(["book-a", "original.pdf"]);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
  });

  it("answers 304 when the browser copy is still current", async () => {
    const first = await get(["book-a", "manifest.json"]);
    const lastModified = first.headers.get("last-modified");
    expect(lastModified).toBeTruthy();
    const second = await get(["book-a", "manifest.json"], {
      "if-modified-since": lastModified ?? "",
    });
    expect(second.status).toBe(304);
  });

  it.each([
    [["..", "package.json"]],
    [["%2e%2e", "package.json"]],
    [["%252e%252e", "package.json"]],
    [["..%2fpackage.json"]],
    [["book-a", "..", "..", "secret.json"]],
    [["book-a", "%2e%2e", "%2e%2e", "secret.json"]],
    [["/etc/passwd"]],
    [["book-a", "notes.txt"]],
    [["book-a", "missing.webp"]],
    [["book-a", "pages"]],
  ])("returns 404 for %j", async (segments) => {
    const response = await get(segments);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("secret");
  });

  it("returns 404 for a symbolic link that leaves the storage folder", async (context) => {
    if (!canSymlink) context.skip();
    const response = await get(["book-a", "link.json"]);
    expect(response.status).toBe(404);
  });
});

describe("listBooks", () => {
  it("lists finished books, newest first, and skips unfinished folders", async () => {
    const books = await listBooks(storage);
    expect(books.map((book) => book.title)).toEqual(["Livre B", "Livre A"]);
    expect(books[0]).toMatchObject({ id: "book-b", pageCount: 2 });
  });

  it("returns an empty list when the folder does not exist", async () => {
    expect(await listBooks(path.join(work, "nope"))).toEqual([]);
  });
});
