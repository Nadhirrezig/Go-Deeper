import { randomUUID } from "node:crypto";
import path from "node:path";
import { ART_PRESET_ORDER, isValidSlug, uniqueSlug } from "@vipgroup/shared";
import type { BookRecord, Folder } from "@vipgroup/shared";
import { readFileIfExists, SerialQueue, writeFileAtomic } from "./atomic-file";
import { LibraryError } from "./errors";
import { checkFolderName, DEFAULT_FOLDER_NAME, newestFirst } from "./repository";
import type { BookPatch, LibraryRepository, NewBook } from "./repository";

/** Content of `library.json`. */
interface LibraryData {
  version: 1;
  folders: Folder[];
  books: BookRecord[];
  /** How many folders were ever created: the next one gets ART_PRESET_ORDER[nextArt % 5]. */
  nextArt: number;
}

const emptyLibrary = (): LibraryData => ({ version: 1, folders: [], books: [], nextArt: 0 });

export interface JsonRepositoryOptions {
  now?: () => Date;
  newId?: () => string;
}

/**
 * The library as one JSON file (until PostgreSQL in step 6).
 * Every operation on the file runs alone (one serial queue per file): it reads the file,
 * applies its change and writes the whole file atomically, so concurrent calls, even from
 * two instances, never lose each other's changes.
 */
/**
 * One queue per file, shared by every repository instance in the process (Next.js dev can
 * load this module twice), so writes to the same file never interleave.
 */
const queues = new Map<string, SerialQueue>();
const queueFor = (file: string): SerialQueue => {
  let queue = queues.get(file);
  if (!queue) queues.set(file, (queue = new SerialQueue()));
  return queue;
};

export class JsonLibraryRepository implements LibraryRepository {
  private readonly queue: SerialQueue;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly file: string,
    options: JsonRepositoryOptions = {},
  ) {
    this.queue = queueFor(path.resolve(file));
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  // --- folders -----------------------------------------------------------------------------

  listFolders(): Promise<Folder[]> {
    return this.change((data) => {
      const created = this.ensureFolder(data);
      return { changed: created, result: [...data.folders] };
    });
  }

  getFolder(id: string): Promise<Folder | null> {
    return this.read((data) => data.folders.find((folder) => folder.id === id) ?? null);
  }

  createFolder(name: string): Promise<Folder> {
    return this.change((data) => {
      this.ensureFolder(data);
      const folder = this.newFolder(data, checkFolderName(name, data.folders));
      return { changed: true, result: folder };
    });
  }

  renameFolder(id: string, name: string): Promise<Folder> {
    return this.change((data) => {
      const folder = data.folders.find((f) => f.id === id);
      if (!folder) throw notFound("Ce dossier n’existe plus.");
      folder.name = checkFolderName(name, data.folders, id);
      return { changed: true, result: { ...folder } };
    });
  }

  deleteFolder(id: string): Promise<void> {
    return this.change((data) => {
      const index = data.folders.findIndex((f) => f.id === id);
      if (index < 0) throw notFound("Ce dossier n’existe plus.");
      if (data.books.some((book) => book.folderId === id)) {
        throw new LibraryError(
          "FOLDER_NOT_EMPTY",
          "Supprimez d’abord les flipbooks de ce dossier.",
        );
      }
      if (data.folders.length <= 1) {
        throw new LibraryError("LAST_FOLDER", "Le dernier dossier ne peut pas être supprimé.");
      }
      data.folders.splice(index, 1);
      return { changed: true, result: undefined };
    });
  }

  // --- books -------------------------------------------------------------------------------

  listBooks(filter: { folderId?: string } = {}): Promise<BookRecord[]> {
    return this.read((data) =>
      data.books
        .filter((book) => !filter.folderId || book.folderId === filter.folderId)
        .sort(newestFirst),
    );
  }

  getBook(id: string): Promise<BookRecord | null> {
    return this.read((data) => data.books.find((book) => book.id === id) ?? null);
  }

  createBook(input: NewBook): Promise<BookRecord> {
    return this.change((data) => {
      if (!data.folders.some((folder) => folder.id === input.folderId)) {
        throw notFound("Ce dossier n’existe plus.");
      }
      if (data.books.some((book) => book.id === input.id)) {
        throw new LibraryError("BOOK_BUSY", "Ce flipbook existe déjà.");
      }
      checkSlug(input.slug, data.books);
      const book: BookRecord = { ...input, createdAt: input.createdAt ?? this.now().toISOString() };
      data.books.push(book);
      return { changed: true, result: { ...book } };
    });
  }

  updateBook(id: string, patch: BookPatch): Promise<BookRecord> {
    return this.change((data) => {
      const index = data.books.findIndex((book) => book.id === id);
      const current = data.books[index];
      if (!current) throw notFound("Ce flipbook n’existe plus.");
      if (patch.slug !== undefined && patch.slug !== current.slug) {
        checkSlug(patch.slug, data.books, id);
      }
      // A key given as undefined (e.g. `progress: undefined`) is removed.
      const next = JSON.parse(JSON.stringify({ ...current, ...patch })) as BookRecord;
      data.books[index] = next;
      return { changed: true, result: { ...next } };
    });
  }

  deleteBook(id: string): Promise<void> {
    return this.change((data) => {
      const index = data.books.findIndex((book) => book.id === id);
      if (index < 0) throw notFound("Ce flipbook n’existe plus.");
      data.books.splice(index, 1);
      return { changed: true, result: undefined };
    });
  }

  slugsInUse(): Promise<Set<string>> {
    return this.read((data) => new Set(data.books.map((book) => book.slug)));
  }

  // --- internals ---------------------------------------------------------------------------

  /** "There is always at least one folder": create "Général" when there is none. */
  private ensureFolder(data: LibraryData): boolean {
    if (data.folders.length > 0) return false;
    this.newFolder(data, DEFAULT_FOLDER_NAME);
    return true;
  }

  private newFolder(data: LibraryData, name: string): Folder {
    const folder: Folder = {
      id: this.newId(),
      name,
      art: ART_PRESET_ORDER[data.nextArt % ART_PRESET_ORDER.length]!,
      createdAt: this.now().toISOString(),
    };
    data.nextArt++;
    data.folders.push(folder);
    return { ...folder };
  }

  private async load(): Promise<LibraryData> {
    const raw = await readFileIfExists(this.file);
    if (raw === null) return emptyLibrary();
    const data = JSON.parse(raw) as Partial<LibraryData>;
    return {
      version: 1,
      folders: data.folders ?? [],
      books: data.books ?? [],
      nextArt: data.nextArt ?? data.folders?.length ?? 0,
    };
  }

  private read<T>(select: (data: LibraryData) => T): Promise<T> {
    return this.queue.run(async () => select(await this.load()));
  }

  private change<T>(apply: (data: LibraryData) => { changed: boolean; result: T }): Promise<T> {
    return this.queue.run(async () => {
      const data = await this.load();
      const { changed, result } = apply(data);
      if (changed) await writeFileAtomic(this.file, JSON.stringify(data, null, 2) + "\n");
      return result;
    });
  }
}

const notFound = (message: string): LibraryError => new LibraryError("NOT_FOUND", message);

function checkSlug(slug: string, books: readonly BookRecord[], exceptId?: string): void {
  if (!isValidSlug(slug)) {
    throw new LibraryError(
      "SLUG_INVALID",
      "Le slug ne peut contenir que des lettres minuscules, des chiffres et des tirets.",
    );
  }
  const taken = new Set(books.filter((book) => book.id !== exceptId).map((book) => book.slug));
  if (taken.has(slug)) {
    throw new LibraryError(
      "SLUG_TAKEN",
      "Ce slug est déjà utilisé par un autre flipbook.",
      uniqueSlug(slug, taken),
    );
  }
}
