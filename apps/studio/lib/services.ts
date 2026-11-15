import { childProcessRunner } from "./conversion/child-runner";
import { ConversionQueue } from "./conversion/queue";
import { Pool } from "pg";
import { JsonLibraryRepository } from "./library/json-repository";
import { PostgresLibraryRepository } from "./library/postgres-repository";
import { migrateLibrary } from "./library/postgres-schema";
import type { LibraryRepository } from "./library/repository";
import { reconcileLibrary } from "./library/startup";
import { Publisher } from "./publish/publisher";
import { getFlipbooksDir, getLibraryFile, getUploadsDir } from "./storage";

export interface Services {
  repo: LibraryRepository;
  queue: ConversionQueue;
  /** Publier / Dépublier on the sites (one operation at a time). */
  publisher: Publisher;
  flipbooksDir: string;
  uploadsDir: string;
  /** Start-up reconcile (interrupted jobs, books converted with the CLI). */
  ready: Promise<void>;
}

// One set per server process. Kept on globalThis so that Next.js dev reloads of this module
// do not start a second queue next to the first one.
const KEY = Symbol.for("vipgroup.studio.services");
type GlobalWithServices = typeof globalThis & { [KEY]?: Services };

/**
 * The library: PostgreSQL when the PG* variables (or DATABASE_URL) say where it is, as
 * docker-compose.yml does; otherwise storage/library.json (development without a database).
 * `prepare` creates or updates the tables and moves an existing library.json in, once.
 */
function createLibrary(): { repo: LibraryRepository; prepare: () => Promise<void> } {
  const url = process.env.DATABASE_URL?.trim();
  if (!url && !process.env.PGHOST?.trim()) {
    console.info("[studio] library: library.json (no PostgreSQL configured)");
    return { repo: new JsonLibraryRepository(getLibraryFile()), prepare: async () => {} };
  }
  // With no connection string, pg reads PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE.
  const pool = new Pool(url ? { connectionString: url } : {});
  pool.on("error", (error) => console.error("[studio] PostgreSQL:", error.message));
  const repo = new PostgresLibraryRepository(pool);
  const prepare = async () => {
    const applied = await migrateLibrary(pool);
    if (applied.length) console.info(`[studio] library: PostgreSQL schema ${applied.join(", ")}`);
    const imported = await repo.importJsonLibrary(getLibraryFile());
    if (imported) {
      console.info(
        `[studio] library: imported library.json (${imported.folders} folder(s), ${imported.books} book(s))`,
      );
    }
    console.info("[studio] library: PostgreSQL");
  };
  return { repo, prepare };
}

function createServices(): Services {
  const flipbooksDir = getFlipbooksDir();
  const uploadsDir = getUploadsDir();
  const { repo, prepare } = createLibrary();
  const queue = new ConversionQueue({ repo, flipbooksDir, run: childProcessRunner() });
  const publisher = new Publisher({ repo, flipbooksDir });
  const ready = prepare()
    .then(() => reconcileLibrary(repo, { flipbooksDir, uploadsDir }))
    .then((report) => {
      const notes = [
        report.interrupted.length &&
          `${report.interrupted.length} interrupted conversion(s) marked failed`,
        report.imported.length &&
          `${report.imported.length} book(s) found on disk added to Général`,
        report.removed.length && `${report.removed.length} leftover file(s) removed`,
        report.publicationsInterrupted.length &&
          `${report.publicationsInterrupted.length} interrupted publication(s) to start again`,
      ].filter(Boolean);
      if (notes.length) console.info(`[studio] library: ${notes.join(", ")}`);
    });
  return { repo, queue, publisher, flipbooksDir, uploadsDir, ready };
}

export function getServices(): Services {
  const scope = globalThis as GlobalWithServices;
  scope[KEY] ??= createServices();
  return scope[KEY];
}

/** The library, once the start-up reconcile has run. Pages and actions use this. */
export async function getLibrary(): Promise<LibraryRepository> {
  const services = getServices();
  await services.ready;
  return services.repo;
}
