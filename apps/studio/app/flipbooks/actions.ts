"use server";

import { revalidatePath } from "next/cache";
import { isValidSlug, slugify, uniqueSlug } from "@vipgroup/shared";
import type { BookRecord, Folder } from "@vipgroup/shared";
import { deleteBook } from "../../lib/books";
import { isLibraryError } from "../../lib/library/errors";
import { isR2Error } from "../../lib/r2/errors";
import { getLibrary, getServices } from "../../lib/services";

export type ActionResult<T = undefined> =
  { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

/**
 * Run a library change; rule violations (and R2 refusals) come back as French messages, not
 * exceptions.
 */
async function attempt<T>(change: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await change();
    revalidatePath("/", "layout");
    return { ok: true, value };
  } catch (error) {
    if (isLibraryError(error) || isR2Error(error)) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export async function createFolderAction(name: string): Promise<ActionResult<Folder>> {
  const repo = await getLibrary();
  return attempt(() => repo.createFolder(name));
}

export async function renameFolderAction(id: string, name: string): Promise<ActionResult<Folder>> {
  const repo = await getLibrary();
  return attempt(() => repo.renameFolder(id, name));
}

export async function deleteFolderAction(id: string): Promise<ActionResult> {
  const repo = await getLibrary();
  return attempt(async () => {
    await repo.deleteFolder(id);
    return undefined;
  });
}

export async function deleteBookAction(id: string): Promise<ActionResult> {
  const services = getServices();
  await services.ready;
  return attempt(async () => {
    await deleteBook(services.repo, services.flipbooksDir, id);
    return undefined;
  });
}

/** "Publier": starts uploading the book to R2 and listing it on goexperience.travel. */
export async function publishBookAction(id: string): Promise<ActionResult<BookRecord>> {
  const services = getServices();
  await services.ready;
  return attempt(() => services.publisher.publish(id));
}

/** "Dépublier": starts removing the book from goexperience.travel and from R2. */
export async function unpublishBookAction(id: string): Promise<ActionResult<BookRecord>> {
  const services = getServices();
  await services.ready;
  return attempt(() => services.publisher.unpublish(id));
}

/**
 * A free slug for the upload form: `slug` itself when valid and unused, otherwise the
 * first free `-2`, `-3`… (from `slugify(slug)` when it is not a valid slug).
 */
export async function suggestSlugAction(
  slug: string,
): Promise<{ slug: string; available: boolean }> {
  const repo = await getLibrary();
  const taken = await repo.slugsInUse();
  const base = isValidSlug(slug) ? slug : slugify(slug) || "flipbook";
  const free = uniqueSlug(base, taken);
  return { slug: free, available: free === slug };
}
