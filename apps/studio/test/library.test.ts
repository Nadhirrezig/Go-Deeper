import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonLibraryRepository } from "../lib/library/json-repository";
import { libraryContract } from "./library-contract";

/** Errors Windows may give a reader while a file is renamed over (see the atomic write test). */
const WINDOWS_RENAME_GAP = new Set(["ENOENT", "EPERM", "EBUSY", "EACCES"]);
const errorCode = (error: unknown): string => (error as NodeJS.ErrnoException).code ?? "";

let work: string;
let file: string;
let repo: JsonLibraryRepository;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-library-"));
  file = path.join(work, "library.json");
  let ids = 0;
  repo = new JsonLibraryRepository(file, { newId: () => `id-${++ids}` });
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

libraryContract("library.json", async (newId) => ({
  repo: new JsonLibraryRepository(file, { newId }),
  second: (otherId) => new JsonLibraryRepository(file, { newId: otherId }),
}));

describe("storage", () => {
  it("writes atomically: never a half-written file, no temp file left", async () => {
    await repo.listFolders();
    // Read the file over and over while many writes happen: every read parses.
    let reading = true;
    let reads = 0;
    const reader = (async () => {
      while (reading) {
        let text: string;
        try {
          text = await readFile(file, "utf8");
        } catch (error) {
          // On Windows, renaming over a file is not one step: a reader outside the studio's
          // queue (only this test) can find no file, or a locked one, for an instant. The
          // content is still never half-written, which is what this test checks.
          if (process.platform === "win32" && WINDOWS_RENAME_GAP.has(errorCode(error))) continue;
          throw error;
        }
        JSON.parse(text);
        reads++;
      }
    })();
    for (let i = 0; i < 40; i++) await repo.createFolder(`Dossier ${i}`);
    reading = false;
    await reader;
    expect(reads).toBeGreaterThan(0);
    expect((await readdir(work)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("reads an existing library.json", async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        folders: [
          { id: "f", name: "Existant", art: "dusk", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
        books: [],
        nextArt: 3,
      }),
    );
    expect((await repo.listFolders()).map((f) => f.name)).toEqual(["Existant"]);
    expect((await repo.createFolder("Nouveau")).art).toBe("glacier");
  });
});
