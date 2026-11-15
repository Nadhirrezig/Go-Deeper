import path from "node:path";
import type { BookRecord } from "@vipgroup/shared";
import { isLibraryError, LibraryError } from "../library/errors";
import type { LibraryRepository } from "../library/repository";
import { deleteBookFolder, uploadBookFolder } from "../r2/book-sync";
import type { SyncProgress } from "../r2/book-sync";
import { createR2Client, r2ConfigFromEnv } from "../r2/client";
import type { R2Client } from "../r2/client";
import { isR2Error } from "../r2/errors";
import { readIndex, withBook, withoutBook, writeIndex } from "../r2/published-index";

/**
 * "Publier" and "Dépublier": put a converted book on goexperience.travel, or take it off.
 *
 * - Publish: upload the book folder to flipbooks/<id>/, then add it to flipbooks/index.json.
 * - Unpublish: remove it from flipbooks/index.json first, then delete its files.
 *
 * So the site never lists a book whose files are missing. Each step can be run again (uploads
 * overwrite, deletes of missing files succeed), so a failed or interrupted operation is fixed by
 * starting it again. Operations run one at a time, in the background; the book record shows
 * their progress (`publication`) and their last failure (`publicationError`).
 */

export interface PublisherDeps {
  repo: LibraryRepository;
  flipbooksDir: string;
  /** The R2 client; throws NOT_CONFIGURED without R2 keys. Default: from the environment. */
  client?: () => R2Client;
  now?: () => Date;
  /** Minimum time between two progress writes to the library. Default 400 ms. */
  progressIntervalMs?: number;
}

type Action = "publish" | "unpublish";

const FAILURE_MESSAGES: Record<Action, string> = {
  publish: "La publication a échoué.",
  unpublish: "La dépublication a échoué.",
};

export class Publisher {
  private readonly repo: LibraryRepository;
  private readonly flipbooksDir: string;
  private readonly makeClient: () => R2Client;
  private readonly now: () => Date;
  private readonly progressIntervalMs: number;
  /** Operations, one after the other. */
  private chain: Promise<void> = Promise.resolve();
  /** Progress writes of the running operation, in order. */
  private progressWrites: Promise<unknown> = Promise.resolve();
  private lastProgressWrite = 0;

  constructor(deps: PublisherDeps) {
    this.repo = deps.repo;
    this.flipbooksDir = deps.flipbooksDir;
    this.makeClient = deps.client ?? (() => createR2Client(r2ConfigFromEnv()));
    this.now = deps.now ?? (() => new Date());
    this.progressIntervalMs = deps.progressIntervalMs ?? 400;
  }

  /**
   * Start publishing `id`. Refusals that need no network come back at once (LibraryError,
   * R2Error NOT_CONFIGURED); the rest runs in the background. Returns the updated record.
   */
  async publish(id: string): Promise<BookRecord> {
    const book = await this.requireIdle(id);
    if (book.status !== "ready") {
      throw new LibraryError(
        "NOT_READY",
        "Ce flipbook n’est pas prêt : attendez la fin de la conversion.",
      );
    }
    return this.start(book, "publish", (client) => this.runPublish(client, id));
  }

  /** Start unpublishing `id` (see `publish`). */
  async unpublish(id: string): Promise<BookRecord> {
    const book = await this.requireIdle(id);
    if (!book.publishedAt) {
      throw new LibraryError("NOT_PUBLISHED", "Ce flipbook n’est pas en ligne.");
    }
    return this.start(book, "unpublish", (client) => this.runUnpublish(client, id));
  }

  /** Resolves when every operation started so far has ended (tests). */
  idle(): Promise<void> {
    return this.chain;
  }

  private async requireIdle(id: string): Promise<BookRecord> {
    const book = await this.repo.getBook(id);
    if (!book) throw new LibraryError("NOT_FOUND", "Ce flipbook n’existe plus.");
    if (book.publication) {
      throw new LibraryError(
        "BOOK_BUSY",
        "Une publication de ce flipbook est déjà en cours : attendez qu’elle se termine.",
      );
    }
    return book;
  }

  private async start(
    book: BookRecord,
    action: Action,
    run: (client: R2Client) => Promise<void>,
  ): Promise<BookRecord> {
    const client = this.makeClient(); // NOT_CONFIGURED is reported now, not in the background
    const updated = await this.repo.updateBook(book.id, {
      publication: { action, done: 0, total: 0 },
      publicationError: undefined,
    });
    this.chain = this.chain.then(async () => {
      this.progressWrites = Promise.resolve();
      this.lastProgressWrite = 0;
      try {
        await run(client);
      } catch (error) {
        await this.fail(book.id, action, error);
      }
    });
    return updated;
  }

  private async runPublish(client: R2Client, id: string): Promise<void> {
    const book = await this.repo.getBook(id);
    if (!book) return;
    const entry = () => ({
      slug: book.slug,
      id,
      title: book.title,
      pageCount: book.pageCount ?? 0,
      publishedAt: book.publishedAt ?? this.now().toISOString(),
    });
    // A clash with another published book stops the publish before anything is sent.
    withBook(await readIndex(client), entry());

    await uploadBookFolder(client, path.join(this.flipbooksDir, id), {
      onProgress: (progress) => this.recordProgress(id, "publish", progress),
    });
    // Read again: the list may have changed during the upload.
    const published = entry();
    await writeIndex(client, withBook(await readIndex(client), published));

    await this.progressWrites;
    await this.repo.updateBook(id, {
      publishedAt: published.publishedAt,
      publication: undefined,
    });
  }

  private async runUnpublish(client: R2Client, id: string): Promise<void> {
    const index = await readIndex(client);
    const without = withoutBook(index, id);
    if (without.books.length !== index.books.length) await writeIndex(client, without);
    // Off the site's list now; the files go next.
    await this.repo.updateBook(id, { publishedAt: undefined });

    await deleteBookFolder(client, id, {
      onProgress: (progress) => this.recordProgress(id, "unpublish", progress),
    });
    await this.progressWrites;
    await this.repo.updateBook(id, { publication: undefined });
  }

  /** Write progress to the record, at most every `progressIntervalMs`, and always the last step. */
  private recordProgress(id: string, action: Action, progress: SyncProgress): void {
    const time = Date.now();
    const last = progress.done === progress.total;
    if (!last && time - this.lastProgressWrite < this.progressIntervalMs) return;
    this.lastProgressWrite = time;
    const publication = { action, done: progress.done, total: progress.total };
    this.progressWrites = this.progressWrites
      .then(() => this.repo.updateBook(id, { publication }))
      .catch(() => undefined);
  }

  private async fail(id: string, action: Action, error: unknown): Promise<void> {
    const known = isR2Error(error) || isLibraryError(error);
    console.error(
      `[studio] ${action} ${id} failed:`,
      isR2Error(error) ? `${error.code} ${error.detail}` : error,
    );
    await this.progressWrites;
    await this.repo
      .updateBook(id, {
        publication: undefined,
        publicationError: {
          code: known ? (error as { code: string }).code : "UNEXPECTED",
          message: known ? (error as Error).message : FAILURE_MESSAGES[action],
        },
      })
      .catch(() => undefined); // the book may be gone
  }
}
