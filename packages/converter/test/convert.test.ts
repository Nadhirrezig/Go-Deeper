import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FlipbookManifest } from "@vipgroup/shared";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConverterError, convertPdf } from "../src/index";
import type { ConvertOptions, SearchEntry } from "../src/index";
import { makePdf } from "./fixtures";

// Small sizes keep the suite fast; the pipeline is the same as with the defaults.
const sizes = { thumb: 100, standard: 300, zoom: 600 };

let work: string;
let outDir: string;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-converter-"));
  outDir = path.join(work, "out");
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(file, "utf8")) as T;

async function expectCode(promise: Promise<unknown>, code: ConverterError["code"]) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConverterError);
  expect((error as ConverterError).code).toBe(code);
}

async function convert(pdf: Uint8Array, options: Partial<ConvertOptions> = {}) {
  const file = path.join(work, "input.pdf");
  await writeFile(file, pdf);
  return convertPdf(file, { outDir, sizes, ...options });
}

describe("convertPdf", () => {
  it("converts a 3-page PDF into the book folder format", async () => {
    const pdf = await makePdf(
      [{ text: "First page alpha" }, { text: "Second page bravo" }, { text: "Third page charlie" }],
      "Brochure Été 2026",
    );
    const events: string[] = [];
    const result = await convert(pdf, { onProgress: (e) => events.push(e.stage) });

    expect(result.dir).toBe(path.join(outDir, result.manifest.id));
    expect(path.isAbsolute(result.dir)).toBe(true);
    expect((await readdir(result.dir)).sort()).toEqual(
      ["manifest.json", "original.pdf", "pages", "search.json"].sort(),
    );
    const pages = (await readdir(path.join(result.dir, "pages"))).sort();
    expect(pages).toEqual([
      "001-thumb.webp",
      "001-zoom.webp",
      "001.webp",
      "002-thumb.webp",
      "002-zoom.webp",
      "002.webp",
      "003-thumb.webp",
      "003-zoom.webp",
      "003.webp",
    ]);

    // Image widths match `sizes`; heights follow page 1's ratio (A4).
    const expectedHeight = (w: number) => Math.round(w / (595 / 842));
    for (const [suffix, width] of [
      ["-thumb", sizes.thumb],
      ["", sizes.standard],
      ["-zoom", sizes.zoom],
    ] as const) {
      const meta = await sharp(path.join(result.dir, "pages", `002${suffix}.webp`)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(width);
      expect(meta.height).toBe(expectedHeight(width));
    }

    // White background, not black/transparent: sample the top-left corner.
    const { data } = await sharp(path.join(result.dir, "pages", "001.webp"))
      .extract({ left: 2, top: 2, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data].slice(0, 3).every((v) => v > 245)).toBe(true);

    const manifest = await readJson<FlipbookManifest>(path.join(result.dir, "manifest.json"));
    expect(manifest).toEqual(result.manifest);
    expect(manifest).toMatchObject({
      version: 1,
      title: "Brochure Été 2026",
      slug: "brochure-ete-2026",
      pageCount: 3,
      pageWidth: sizes.standard,
      pageHeight: expectedHeight(sizes.standard),
      pdf: "original.pdf",
      search: "search.json",
    });
    expect(manifest.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(manifest.createdAt))).toBe(false);
    expect(manifest.pages[0]).toEqual({
      n: 1,
      thumb: "pages/001-thumb.webp",
      standard: "pages/001.webp",
      zoom: "pages/001-zoom.webp",
    });

    expect(await readFile(path.join(result.dir, "original.pdf"))).toEqual(Buffer.from(pdf));

    const search = await readJson<SearchEntry[]>(path.join(result.dir, "search.json"));
    expect(search.map((e) => e.page)).toEqual([1, 2, 3]);
    expect(search[0]?.text).toContain("First page alpha");
    expect(search[1]?.text).toContain("Second page bravo");
    expect(search[2]?.text).toContain("Third page charlie");

    expect(result.warnings).toEqual([]);
    expect(events.filter((s) => s === "render")).toHaveLength(3);
    expect(events.at(-1)).toBe("write");
    expect(await readdir(outDir)).toEqual([manifest.id]);
  });

  it("keeps accented text in search.json", async () => {
    const result = await convert(await makePdf([{ text: "Café à la plage, garçon été" }]));
    const search = await readJson<SearchEntry[]>(path.join(result.dir, "search.json"));
    expect(search[0]?.text).toContain("Café à la plage, garçon été");
  });

  it("letterboxes a page with a different ratio and warns once", async () => {
    const pdf = await makePdf([
      { text: "Portrait" },
      { text: "Landscape", size: [842, 595] },
      { text: "Portrait again" },
    ]);
    const result = await convert(pdf);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^Page 2:/);

    const zoom = path.join(result.dir, "pages", "002-zoom.webp");
    const meta = await sharp(zoom).metadata();
    expect(meta.width).toBe(sizes.zoom);
    expect(meta.height).toBe(Math.round(sizes.zoom / (595 / 842)));
    // Top band is white padding: the landscape page sits centred.
    const { data, info } = await sharp(zoom)
      .extract({ left: 0, top: 0, width: sizes.zoom, height: 20 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(sizes.zoom);
    expect(Math.min(...data)).toBeGreaterThan(245);
  });

  it("uses the file name as title and warns when no page has text", async () => {
    const result = await convert(await makePdf([{}, {}]));
    expect(result.manifest.title).toBe("input");
    expect(result.warnings).toContain("PDF looks scanned: search will find nothing.");
  });

  it("accepts bytes and explicit id/slug", async () => {
    const pdf = await makePdf([{ text: "Bytes" }]);
    const result = await convertPdf(pdf, { outDir, sizes, id: "my-book", slug: "custom-slug" });
    expect(result.dir).toBe(path.join(outDir, "my-book"));
    expect(result.manifest).toMatchObject({
      id: "my-book",
      slug: "custom-slug",
      title: "Untitled",
    });
  });

  it("rejects a non-PDF file with INVALID_PDF", async () => {
    const fakeJpg = path.join(work, "photo.pdf");
    await writeFile(
      fakeJpg,
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from("JFIF not a pdf")]),
    );
    await expectCode(convertPdf(fakeJpg, { outDir, sizes }), "INVALID_PDF");
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("rejects a zero-page PDF with EMPTY_PDF", async () => {
    await expectCode(convert(await makePdf([])), "EMPTY_PDF");
  });

  it("rejects too many pages with TOO_MANY_PAGES", async () => {
    const pdf = await makePdf([{ text: "1" }, { text: "2" }, { text: "3" }]);
    await expectCode(convert(pdf, { maxPages: 2 }), "TOO_MANY_PAGES");
  });

  it("aborts mid-conversion with ABORTED and leaves no folder behind", async () => {
    const pdf = await makePdf(Array.from({ length: 6 }, (_, i) => ({ text: `Page ${i + 1}` })));
    const controller = new AbortController();
    const promise = convert(pdf, {
      id: "aborted-book",
      concurrency: 1,
      signal: controller.signal,
      onProgress: (e) => {
        if (e.stage === "render" && e.page === 2) controller.abort();
      },
    });
    await expectCode(promise, "ABORTED");
    expect(await readdir(outDir)).toEqual([]);
  });

  it("rejects an existing target with OUT_DIR_EXISTS", async () => {
    await mkdir(path.join(outDir, "taken"), { recursive: true });
    await expectCode(convert(await makePdf([{ text: "x" }]), { id: "taken" }), "OUT_DIR_EXISTS");
    expect(await readdir(outDir)).toEqual(["taken"]);
  });
});

describe("publish (rename of the finished folder)", () => {
  const busy = (code: string) => Object.assign(new Error(code), { code });

  it("retries a rename briefly blocked by another process (OneDrive, antivirus)", async () => {
    const { publish } = await import("../src/convert");
    const tmp = path.join(work, "book.tmp");
    const final = path.join(work, "book");
    await mkdir(tmp);
    let calls = 0;
    await publish(tmp, final, async (from, to) => {
      calls++;
      if (calls < 3) throw busy("EPERM");
      const { rename } = await import("node:fs/promises");
      await rename(from, to);
    });
    expect(calls).toBe(3);
    expect(await readdir(work)).toContain("book");
  });

  it("reports OUT_DIR_EXISTS only when the folder is really there", async () => {
    const { publish } = await import("../src/convert");
    const final = path.join(work, "taken");
    await mkdir(final);
    await expectCode(
      publish(path.join(work, "x.tmp"), final, async () => {
        throw busy("EPERM");
      }),
      "OUT_DIR_EXISTS",
    );
  });

  it("gives up on a rename that keeps failing", async () => {
    const { publish } = await import("../src/convert");
    let calls = 0;
    const failing = publish(path.join(work, "y.tmp"), path.join(work, "y"), async () => {
      calls++;
      throw busy("EACCES");
    });
    await expect(failing).rejects.toMatchObject({ code: "EACCES" });
    expect(calls).toBe(6);
  }, 10_000);
});
