import type { BookRecord, Folder } from "@vipgroup/shared";
import { describe, expect, it } from "vitest";
import { folderFiles } from "../components/folders/folder-files";

const folder: Folder = {
  id: "f1",
  name: "Général",
  art: "aurora",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const book = (n: number, patch: Partial<BookRecord> = {}): BookRecord => ({
  id: `b${n}`,
  folderId: "f1",
  title: `Livre ${n}`,
  slug: `livre-${n}`,
  status: "ready",
  pageCount: 12,
  createdAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`,
  ...patch,
});

describe("folderFiles (sheets of a folder)", () => {
  it("shows every book up to 4, newest at the front, with page 1's standard image", () => {
    const files = folderFiles(folder, [book(1), book(3), book(2), book(9, { folderId: "other" })]);
    expect(files.map((f) => f.name)).toEqual(["Livre 1", "Livre 2", "Livre 3"]);
    expect(files[2]).toMatchObject({
      id: "b3:ready",
      meta: "12 p.",
      image: "/files/b3/pages/001.webp",
      href: "/flipbooks/b3",
    });
  });

  it("uses a 4-digit cover name for books of 1000+ pages", () => {
    expect(folderFiles(folder, [book(1, { pageCount: 1200 })])[0]?.image).toBe(
      "/files/b1/pages/0001.webp",
    );
  });

  it("past 4 books: the 3 most recent, then 'Voir les N flipbooks' to the folder page", () => {
    const files = folderFiles(
      folder,
      [1, 2, 3, 4, 5, 6].map((n) => book(n)),
    );
    expect(files.map((f) => f.name)).toEqual([
      "Livre 4",
      "Livre 5",
      "Livre 6",
      "Voir les 6 flipbooks",
    ]);
    expect(files[3]).toMatchObject({ href: "/flipbooks/folders/f1" });
  });

  it("shows conversion progress on a plain sheet, and changes id when ready (drops in)", () => {
    const converting = book(1, {
      status: "converting",
      progress: { page: 12, total: 48 },
      pageCount: undefined,
    });
    const [sheet] = folderFiles(folder, [converting]);
    expect(sheet).toMatchObject({
      id: "b1:converting",
      meta: "Conversion 12/48",
      image: undefined,
    });
    const [ready] = folderFiles(folder, [book(1)]);
    expect(ready?.id).not.toBe(sheet?.id);
    expect(folderFiles(folder, [book(2, { status: "failed" })])[0]?.meta).toBe("Échec");
  });
});
