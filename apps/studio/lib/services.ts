import { childProcessRunner } from "./conversion/child-runner";
import { ConversionQueue } from "./conversion/queue";
import { JsonLibraryRepository } from "./library/json-repository";
import type { LibraryRepository } from "./library/repository";
import { reconcileLibrary } from "./library/startup";
import { Publisher } from "./publish/publisher";
import { getFlipbooksDir, getLibraryFile, getUploadsDir } from "./storage";

export interface Services {
  repo: LibraryRepository;
  queue: ConversionQueue;
  /** Publier / Dépublier on goexperience.travel (one operation at a time). */
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

function createServices(): Services {
  const flipbooksDir = getFlipbooksDir();
  const uploadsDir = getUploadsDir();
  const repo = new JsonLibraryRepository(getLibraryFile());
  const queue = new ConversionQueue({ repo, flipbooksDir, run: childProcessRunner() });
  const publisher = new Publisher({ repo, flipbooksDir });
  const ready = reconcileLibrary(repo, { flipbooksDir, uploadsDir }).then((report) => {
    const notes = [
      report.interrupted.length &&
        `${report.interrupted.length} interrupted conversion(s) marked failed`,
      report.imported.length && `${report.imported.length} book(s) found on disk added to Général`,
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
