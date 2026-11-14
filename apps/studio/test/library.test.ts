import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonLibraryRepository } from "../lib/library/json-repository";
import type { LibraryError } from "../lib/library/errors";
import type { NewBook } from "../lib/library/repository";

let work: string;
let file: string;
let repo: JsonLibraryRepository;
let ids = 0;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-library-"));
  file = path.join(work, "library.json");
  ids = 0;
  repo = new JsonLibraryRepository(file, { newId: () => `id-${++ids}` });
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as LibraryError).code;
  }
}

const book = (id: string, folderId: string, slug = id): NewBook => ({
  id,
  folderId,
  title: id,
  slug,
  status: "ready",
});

describe("folders", () => {
  it("starts with one folder, Général, and never has none", async () => {
    const folders = await repo.listFolders();
    expect(folders.map((f) => f.name)).toEqual(["Général"]);
    expect(await repo.listFolders()).toHaveLength(1); // not created twice
  });

  it("gives each new folder the next artwork in order, then repeats", async () => {
    await repo.listFolders();
    const names = ["B", "C", "D", "E", "F"];
    for (const name of names) await repo.createFolder(name);
    expect((await repo.listFolders()).map((f) => f.art)).toEqual([
      "aurora",
      "ember",
      "dusk",
      "glacier",
      "verdant",
      "aurora",
    ]);
  });

  it("needs a name of 1 to 60 characters, unique without regard to case", async () => {
    await repo.listFolders();
    expect(await code(repo.createFolder("   "))).toBe("NAME_INVALID");
    expect(await code(repo.createFolder("x".repeat(61)))).toBe("NAME_INVALID");
    expect(await code(repo.createFolder("GÉNÉRAL"))).toBe("NAME_TAKEN");
    const summer = await repo.createFolder("  Été   2026 ");
    expect(summer.name).toBe("Été 2026");
    expect(await code(repo.createFolder("été 2026"))).toBe("NAME_TAKEN");
  });

  it("renames, keeping the same rules (its own name is fine)", async () => {
    const [general] = await repo.listFolders();
    const other = await repo.createFolder("Brochures");
    expect((await repo.renameFolder(general!.id, "général")).name).toBe("général");
    expect(await code(repo.renameFolder(general!.id, "BROCHURES"))).toBe("NAME_TAKEN");
    expect(await code(repo.renameFolder(other.id, ""))).toBe("NAME_INVALID");
    expect(await code(repo.renameFolder("nope", "X"))).toBe("NOT_FOUND");
  });

  it("refuses to delete a folder that holds books, or the last folder", async () => {
    const [general] = await repo.listFolders();
    const other = await repo.createFolder("Brochures");
    await repo.createBook(book("b1", other.id));
    expect(await code(repo.deleteFolder(other.id))).toBe("FOLDER_NOT_EMPTY");
    await repo.deleteBook("b1");
    await repo.deleteFolder(other.id);
    expect(await code(repo.deleteFolder(general!.id))).toBe("LAST_FOLDER");
    expect(await repo.listFolders()).toHaveLength(1);
  });
});

describe("books", () => {
  it("lists newest first, per folder, and updates or removes fields", async () => {
    const [general] = await repo.listFolders();
    const other = await repo.createFolder("Autre");
    await repo.createBook({ ...book("old", general!.id), createdAt: "2026-01-01T00:00:00.000Z" });
    await repo.createBook({ ...book("new", general!.id), createdAt: "2026-06-01T00:00:00.000Z" });
    await repo.createBook(book("elsewhere", other.id));
    expect((await repo.listBooks({ folderId: general!.id })).map((b) => b.id)).toEqual([
      "new",
      "old",
    ]);

    await repo.updateBook("new", { status: "converting", progress: { page: 3, total: 9 } });
    const done = await repo.updateBook("new", {
      status: "ready",
      progress: undefined,
      pageCount: 9,
    });
    expect(done).toMatchObject({ status: "ready", pageCount: 9 });
    expect("progress" in done).toBe(false);
  });

  it("keeps slugs unique and suggests -2, -3…", async () => {
    const [general] = await repo.listFolders();
    await repo.createBook(book("a", general!.id, "brochure"));
    try {
      await repo.createBook(book("b", general!.id, "brochure"));
      expect.unreachable();
    } catch (error) {
      expect((error as LibraryError).code).toBe("SLUG_TAKEN");
      expect((error as LibraryError).suggestion).toBe("brochure-2");
    }
    await repo.createBook(book("b", general!.id, "brochure-2"));
    expect(await code(repo.createBook(book("c", general!.id, "Not A Slug")))).toBe("SLUG_INVALID");
    expect(await code(repo.createBook(book("c", "missing-folder")))).toBe("NOT_FOUND");
  });
});

describe("storage", () => {
  it("writes atomically: never a half-written file, no temp file left", async () => {
    await repo.listFolders();
    // Read the file over and over while many writes happen: every read parses.
    let reading = true;
    let reads = 0;
    const reader = (async () => {
      while (reading) {
        JSON.parse(await readFile(file, "utf8"));
        reads++;
      }
    })();
    for (let i = 0; i < 40; i++) await repo.createFolder(`Dossier ${i}`);
    reading = false;
    await reader;
    expect(reads).toBeGreaterThan(0);
    expect((await readdir(work)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("does not lose concurrent writes", async () => {
    const [general] = await repo.listFolders();
    // Two instances on the same file (Next.js dev can load the module twice), all at once.
    const second = new JsonLibraryRepository(file, { newId: () => `other-${++ids}` });
    await Promise.all([
      ...Array.from({ length: 25 }, (_, i) => repo.createFolder(`A${i}`)),
      ...Array.from({ length: 25 }, (_, i) =>
        second.createBook(book(`book-${i}`, general!.id, `slug-${i}`)),
      ),
      ...Array.from({ length: 10 }, (_, i) => second.createFolder(`B${i}`)),
    ]);
    expect(await repo.listFolders()).toHaveLength(36);
    expect(await repo.listBooks()).toHaveLength(25);
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
