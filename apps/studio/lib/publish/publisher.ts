import path from "node:path";
import { isPublishSite, PUBLISH_SITES } from "@vipgroup/shared";
import type { BookRecord, PublishSite } from "@vipgroup/shared";
import { isLibraryError, LibraryError } from "../library/errors";
import type { LibraryRepository } from "../library/repository";
import { deleteBookFolder, uploadBookFolder } from "../r2/book-sync";
import type { SyncProgress } from "../r2/book-sync";
import { createR2Client, r2ConfigFromEnv } from "../r2/client";
import type { R2Client } from "../r2/client";
import { isR2Error } from "../r2/errors";
import { readIndex, withBook, withoutBook, writeIndex } from "../r2/published-index";
import { siteConfigs } from "./sites";

/**
 * "Publier" and "Dépublier": put a converted book on one or more sites, or take it off one.
 * Each site reads its own R2 bucket (lib/publish/sites.ts).
 *
 * - Publish: for each chosen site, upload the book folder to flipbooks/<id>/ in its bucket,
 *   then add it to that bucket's flipbooks/index.json.
 * - Unpublish: remove it from the site's flipbooks/index.json first, then delete its files there.
 *
 * So a site never lists a book whose files are missing. Each step can be run again (uploads
 * overwrite, deletes of missing files succeed), so a failed or interrupted operation is fixed by
 * starting it again. Operations run one at a time, in the background; the book record shows
 * their progress (`publication`, with its site) and their last failure (`publicationError`).
 * Publishing to several sites goes one site after the other and stops at the first failure:
 * the sites done before it stay online.
 */

export interface PublisherDeps {
  repo: LibraryRepository;
  flipbooksDir: string;
  /** The R2 client of a site's bucket; throws NOT_CONFIGURED without R2 keys. Default: from the environment. */
  client?: (site: PublishSite) => R2Client;
  now?: () => Date;
  /** Minimum time between two progress writes to the library. Default 400 ms. */
  progressIntervalMs?: number;
}

type Action = "publish" | "unpublish";

const FAILURE_MESSAGES: Record<Action, string> = {
  publish: "La publication a échoué.",
  unpublish: "La dépublication a échoué.",
};

function defaultClient(site: PublishSite): R2Client {
  return createR2Client({ ...r2ConfigFromEnv(), bucket: siteConfigs()[site].bucket });
}

export class Publisher {
  private readonly repo: LibraryRepository;
  private readonly flipbooksDir: string;
  private readonly makeClient: (site: PublishSite) => R2Client;
  private readonly now: () => Date;
  private readonly progressIntervalMs: number;
  /** Operations, one after the other. */
  private chain: Promise<void> = Promise.resolve();
  /** Progress writes of the running operation, in order. */
  private progressWrites: Promise<unknown> = Promise.resolve();
  private lastProgressWrite = 0;
  /** The site the running operation is working on, named in its failure. */
  private runningSite: PublishSite | undefined;
  /** The sites the running publish will do next. */
  private waiting: PublishSite[] = [];

  constructor(deps: PublisherDeps) {
    this.repo = deps.repo;
    this.flipbooksDir = deps.flipbooksDir;
    this.makeClient = deps.client ?? defaultClient;
    this.now = deps.now ?? (() => new Date());
    this.progressIntervalMs = deps.progressIntervalMs ?? 400;
  }

  /**
   * Start publishing `id` on `sites` (one or more). Refusals that need no network come back at
   * once (LibraryError, R2Error NOT_CONFIGURED); the rest runs in the background. Returns the
   * updated record.
   */
  async publish(id: string, sites: readonly PublishSite[]): Promise<BookRecord> {
    const chosen = PUBLISH_SITES.filter((site) => sites.includes(site));
    if (chosen.length === 0 || !sites.every(isPublishSite)) {
      throw new LibraryError("NO_SITE", "Choisissez au moins un site.");
    }
    const book = await this.requireIdle(id);
    if (book.status !== "ready") {
      throw new LibraryError(
        "NOT_READY",
        "Ce flipbook n’est pas prêt : attendez la fin de la conversion.",
      );
    }
    // NOT_CONFIGURED is reported now, not in the background.
    const clients = chosen.map((site) => ({ site, client: this.makeClient(site) }));
    return this.start(book, "publish", chosen, async () => {
      for (const { site, client } of clients) await this.runPublish(client, id, site);
    });
  }

  /** Start unpublishing `id` from `site` (see `publish`). */
  async unpublish(id: string, site: PublishSite): Promise<BookRecord> {
    if (!isPublishSite(site)) throw new LibraryError("NO_SITE", "Choisissez un site.");
    const book = await this.requireIdle(id);
    if (!book.sites?.[site]) {
      throw new LibraryError("NOT_PUBLISHED", "Ce flipbook n’est pas en ligne sur ce site.");
    }
    const client = this.makeClient(site);
    return this.start(book, "unpublish", [site], () => this.runUnpublish(client, id, site));
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

  /** The record's `publication` for a step: the site worked on, and the sites after it. */
  private publication(
    action: Action,
    site: PublishSite,
    done: number,
    total: number,
    waiting: readonly PublishSite[],
  ): NonNullable<BookRecord["publication"]> {
    return { action, site, done, total, ...(waiting.length > 0 && { waiting: [...waiting] }) };
  }

  private async start(
    book: BookRecord,
    action: Action,
    sites: readonly PublishSite[],
    run: () => Promise<void>,
  ): Promise<BookRecord> {
    const [site, ...waiting] = sites as [PublishSite, ...PublishSite[]];
    const updated = await this.repo.updateBook(book.id, {
      publication: this.publication(action, site, 0, 0, waiting),
      publicationError: undefined,
    });
    this.chain = this.chain.then(async () => {
      this.progressWrites = Promise.resolve();
      this.lastProgressWrite = 0;
      this.runningSite = site;
      this.waiting = waiting;
      try {
        await run();
      } catch (error) {
        await this.fail(book.id, action, this.runningSite ?? site, error);
      }
    });
    return updated;
  }

  private async runPublish(client: R2Client, id: string, site: PublishSite): Promise<void> {
    const book = await this.repo.getBook(id);
    if (!book) return;
    if (site !== this.runningSite) {
      this.runningSite = site;
      this.waiting = this.waiting.filter((next) => next !== site);
      await this.repo.updateBook(id, {
        publication: this.publication("publish", site, 0, 0, this.waiting),
      });
    }
    const entry = () => ({
      slug: book.slug,
      id,
      title: book.title,
      pageCount: book.pageCount ?? 0,
      publishedAt: book.sites?.[site]?.publishedAt ?? this.now().toISOString(),
    });
    // A clash with another book published on this site stops before anything is sent.
    withBook(await readIndex(client), entry());

    await uploadBookFolder(client, path.join(this.flipbooksDir, id), {
      onProgress: (progress) => this.recordProgress(id, "publish", site, progress),
    });
    // Read again: the list may have changed during the upload.
    const published = entry();
    await writeIndex(client, withBook(await readIndex(client), published));

    await this.progressWrites;
    const current = await this.repo.getBook(id);
    await this.repo.updateBook(id, {
      sites: { ...current?.sites, [site]: { publishedAt: published.publishedAt } },
      publication: undefined,
    });
  }

  private async runUnpublish(client: R2Client, id: string, site: PublishSite): Promise<void> {
    const index = await readIndex(client);
    const without = withoutBook(index, id);
    if (without.books.length !== index.books.length) await writeIndex(client, without);
    // Off the site's list now; the files go next.
    const remaining = { ...(await this.repo.getBook(id))?.sites };
    delete remaining[site];
    await this.repo.updateBook(id, {
      sites: Object.keys(remaining).length > 0 ? remaining : undefined,
    });

    await deleteBookFolder(client, id, {
      onProgress: (progress) => this.recordProgress(id, "unpublish", site, progress),
    });
    await this.progressWrites;
    await this.repo.updateBook(id, { publication: undefined });
  }

  /** Write progress to the record, at most every `progressIntervalMs`, and always the last step. */
  private recordProgress(
    id: string,
    action: Action,
    site: PublishSite,
    progress: SyncProgress,
  ): void {
    const time = Date.now();
    const last = progress.done === progress.total;
    if (!last && time - this.lastProgressWrite < this.progressIntervalMs) return;
    this.lastProgressWrite = time;
    const publication = this.publication(action, site, progress.done, progress.total, this.waiting);
    this.progressWrites = this.progressWrites
      .then(() => this.repo.updateBook(id, { publication }))
      .catch(() => undefined);
  }

  private async fail(id: string, action: Action, site: PublishSite, error: unknown): Promise<void> {
    const known = isR2Error(error) || isLibraryError(error);
    console.error(
      `[studio] ${action} ${id} on ${site} failed:`,
      isR2Error(error) ? `${error.code} ${error.detail}` : error,
    );
    await this.progressWrites;
    await this.repo
      .updateBook(id, {
        publication: undefined,
        publicationError: {
          code: known ? (error as { code: string }).code : "UNEXPECTED",
          message: known ? (error as Error).message : FAILURE_MESSAGES[action],
          site,
        },
      })
      .catch(() => undefined); // the book may be gone
  }
}
