import { randomUUID } from "node:crypto";
import { rename } from "node:fs/promises";
import { ART_PRESET_ORDER } from "@vipgroup/shared";
import type { BookRecord, Folder } from "@vipgroup/shared";
import type { Pool, PoolClient } from "pg";
import { readFileIfExists } from "./atomic-file";
import { LibraryError } from "./errors";
import { LIBRARY_LOCK } from "./postgres-schema";
import {
  checkFolderName,
  checkSlug,
  DEFAULT_FOLDER_NAME,
  newestFirst,
  upgradeBookRecord,
} from "./repository";
import type { BookPatch, LibraryRepository, NewBook } from "./repository";

export interface PostgresRepositoryOptions {
  now?: () => Date;
  newId?: () => string;
}

interface FolderRow {
  id: string;
  name: string;
  art: Folder["art"];
  created_at: string;
}

const toFolder = (row: FolderRow): Folder => ({
  id: row.id,
  name: row.name,
  art: row.art,
  createdAt: row.created_at,
});

const notFound = (message: string): LibraryError => new LibraryError("NOT_FOUND", message);

/** A record as stored: keys given as undefined (e.g. `progress: undefined`) are removed. */
const clean = (book: BookRecord): BookRecord => JSON.parse(JSON.stringify(book)) as BookRecord;

/**
 * The library in PostgreSQL (from S8b, with Docker Compose). Same rules and French messages as
 * JsonLibraryRepository: every change runs in a transaction holding one advisory lock, reads
 * what its rule needs, then writes, so changes never interleave, even from two processes.
 */
export class PostgresLibraryRepository implements LibraryRepository {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly pool: Pool,
    options: PostgresRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  // --- folders -----------------------------------------------------------------------------

  async listFolders(): Promise<Folder[]> {
    const folders = await this.folders(this.pool);
    if (folders.length > 0) return folders;
    // "There is always at least one folder": create "Général" when there is none.
    return this.change(async (client) => {
      const existing = await this.folders(client);
      if (existing.length === 0) existing.push(await this.newFolder(client, DEFAULT_FOLDER_NAME));
      return existing;
    });
  }

  async getFolder(id: string): Promise<Folder | null> {
    const { rows } = await this.pool.query<FolderRow>(
      "SELECT id, name, art, created_at FROM folders WHERE id = $1",
      [id],
    );
    return rows[0] ? toFolder(rows[0]) : null;
  }

  createFolder(name: string): Promise<Folder> {
    return this.change(async (client) => {
      const folders = await this.folders(client);
      if (folders.length === 0) folders.push(await this.newFolder(client, DEFAULT_FOLDER_NAME));
      return this.newFolder(client, checkFolderName(name, folders));
    });
  }

  renameFolder(id: string, name: string): Promise<Folder> {
    return this.change(async (client) => {
      const folders = await this.folders(client);
      const folder = folders.find((f) => f.id === id);
      if (!folder) throw notFound("Ce dossier n’existe plus.");
      folder.name = checkFolderName(name, folders, id);
      await client.query("UPDATE folders SET name = $2 WHERE id = $1", [id, folder.name]);
      return folder;
    });
  }

  deleteFolder(id: string): Promise<void> {
    return this.change(async (client) => {
      const folders = await this.folders(client);
      if (!folders.some((f) => f.id === id)) throw notFound("Ce dossier n’existe plus.");
      const { rowCount } = await client.query("SELECT 1 FROM books WHERE folder_id = $1 LIMIT 1", [
        id,
      ]);
      if (rowCount) {
        throw new LibraryError(
          "FOLDER_NOT_EMPTY",
          "Supprimez d’abord les flipbooks de ce dossier.",
        );
      }
      if (folders.length <= 1) {
        throw new LibraryError("LAST_FOLDER", "Le dernier dossier ne peut pas être supprimé.");
      }
      await client.query("DELETE FROM folders WHERE id = $1", [id]);
    });
  }

  // --- books -------------------------------------------------------------------------------

  async listBooks(filter: { folderId?: string } = {}): Promise<BookRecord[]> {
    const { rows } = filter.folderId
      ? await this.pool.query<{ record: BookRecord }>(
          "SELECT record FROM books WHERE folder_id = $1",
          [filter.folderId],
        )
      : await this.pool.query<{ record: BookRecord }>("SELECT record FROM books");
    return rows.map((row) => upgradeBookRecord(row.record)).sort(newestFirst);
  }

  async getBook(id: string): Promise<BookRecord | null> {
    const { rows } = await this.pool.query<{ record: BookRecord }>(
      "SELECT record FROM books WHERE id = $1",
      [id],
    );
    return rows[0] ? upgradeBookRecord(rows[0].record) : null;
  }

  createBook(input: NewBook): Promise<BookRecord> {
    return this.change(async (client) => {
      const folder = await client.query("SELECT 1 FROM folders WHERE id = $1", [input.folderId]);
      if (!folder.rowCount) throw notFound("Ce dossier n’existe plus.");
      const existing = await client.query("SELECT 1 FROM books WHERE id = $1", [input.id]);
      if (existing.rowCount) throw new LibraryError("BOOK_BUSY", "Ce flipbook existe déjà.");
      checkSlug(input.slug, await this.slugRows(client));
      const book = clean({ ...input, createdAt: input.createdAt ?? this.now().toISOString() });
      await this.insertBook(client, book);
      return book;
    });
  }

  updateBook(id: string, patch: BookPatch): Promise<BookRecord> {
    return this.change(async (client) => {
      const { rows } = await client.query<{ record: BookRecord }>(
        "SELECT record FROM books WHERE id = $1",
        [id],
      );
      const current = rows[0] && upgradeBookRecord(rows[0].record);
      if (!current) throw notFound("Ce flipbook n’existe plus.");
      if (patch.slug !== undefined && patch.slug !== current.slug) {
        checkSlug(patch.slug, await this.slugRows(client), id);
      }
      const next = clean({ ...current, ...patch });
      await client.query("UPDATE books SET folder_id = $2, slug = $3, record = $4 WHERE id = $1", [
        id,
        next.folderId,
        next.slug,
        JSON.stringify(next),
      ]);
      return next;
    });
  }

  deleteBook(id: string): Promise<void> {
    return this.change(async (client) => {
      const { rowCount } = await client.query("DELETE FROM books WHERE id = $1", [id]);
      if (!rowCount) throw notFound("Ce flipbook n’existe plus.");
    });
  }

  async slugsInUse(): Promise<Set<string>> {
    const { rows } = await this.pool.query<{ slug: string }>("SELECT slug FROM books");
    return new Set(rows.map((row) => row.slug));
  }

  /**
   * One-time move from library.json (the studio's library before PostgreSQL): when the database
   * holds no folder yet and `file` exists, copy its folders, books and artwork counter, then
   * rename the file to `<file>.imported`. Returns what was imported, or null.
   */
  async importJsonLibrary(file: string): Promise<{ folders: number; books: number } | null> {
    const raw = await readFileIfExists(file);
    if (raw === null) return null;
    const data = JSON.parse(raw) as {
      folders?: Folder[];
      books?: BookRecord[];
      nextArt?: number;
    };
    const imported = await this.change(async (client) => {
      const { rowCount } = await client.query("SELECT 1 FROM folders LIMIT 1");
      if (rowCount) return null;
      const folders = data.folders ?? [];
      const books = data.books ?? [];
      for (const folder of folders) {
        await client.query(
          "INSERT INTO folders (id, name, art, created_at) VALUES ($1, $2, $3, $4)",
          [folder.id, folder.name, folder.art, folder.createdAt],
        );
      }
      for (const book of books) await this.insertBook(client, clean(upgradeBookRecord(book)));
      await client.query("UPDATE library_state SET next_art = $1 WHERE id = 1", [
        data.nextArt ?? folders.length,
      ]);
      return { folders: folders.length, books: books.length };
    });
    if (imported) await rename(/*turbopackIgnore: true*/ file, `${file}.imported`);
    return imported;
  }

  // --- internals ---------------------------------------------------------------------------

  /** Run `work` in a transaction holding the library lock; roll back if it throws. */
  private async change<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [LIBRARY_LOCK]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async folders(db: Pool | PoolClient): Promise<Folder[]> {
    const { rows } = await db.query<FolderRow>(
      "SELECT id, name, art, created_at FROM folders ORDER BY seq",
    );
    return rows.map(toFolder);
  }

  private async newFolder(client: PoolClient, name: string): Promise<Folder> {
    const { rows } = await client.query<{ next_art: number }>(
      "UPDATE library_state SET next_art = next_art + 1 WHERE id = 1 RETURNING next_art - 1 AS next_art",
    );
    const folder: Folder = {
      id: this.newId(),
      name,
      art: ART_PRESET_ORDER[rows[0]!.next_art % ART_PRESET_ORDER.length]!,
      createdAt: this.now().toISOString(),
    };
    await client.query("INSERT INTO folders (id, name, art, created_at) VALUES ($1, $2, $3, $4)", [
      folder.id,
      folder.name,
      folder.art,
      folder.createdAt,
    ]);
    return folder;
  }

  /** The id and slug of every book: what checkSlug needs. */
  private async slugRows(client: PoolClient): Promise<Pick<BookRecord, "id" | "slug">[]> {
    const { rows } = await client.query<{ id: string; slug: string }>("SELECT id, slug FROM books");
    return rows;
  }

  private async insertBook(client: PoolClient, book: BookRecord): Promise<void> {
    await client.query("INSERT INTO books (id, folder_id, slug, record) VALUES ($1, $2, $3, $4)", [
      book.id,
      book.folderId,
      book.slug,
      JSON.stringify(book),
    ]);
  }
}
