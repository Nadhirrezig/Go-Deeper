/** Artwork of a folder in the studio, assigned in this order to new folders. */
export type ArtPreset = "aurora" | "ember" | "dusk" | "glacier" | "verdant";

export const ART_PRESET_ORDER: readonly ArtPreset[] = [
  "aurora",
  "ember",
  "dusk",
  "glacier",
  "verdant",
];

/** A named, flat collection of flipbooks (how the team organises its work). */
export interface Folder {
  id: string;
  name: string;
  art: ArtPreset;
  createdAt: string; // ISO
}

export type BookStatus = "converting" | "ready" | "failed";

/** The websites a book can be published to, each with its own R2 bucket (CLAUDE.md, step 7). */
export const PUBLISH_SITES = ["goexperience", "vipdestinations"] as const;
export type PublishSite = (typeof PUBLISH_SITES)[number];

export const isPublishSite = (value: unknown): value is PublishSite =>
  typeof value === "string" && (PUBLISH_SITES as readonly string[]).includes(value);

/** One converted (or converting) PDF in the studio library. `id` is the book folder name. */
export interface BookRecord {
  id: string;
  folderId: string;
  title: string;
  slug: string;
  status: BookStatus;
  /** While converting: pages rendered so far. */
  progress?: { page: number; total: number };
  /** When failed: the converter error code and a French message for the team. */
  error?: { code: string; message: string };
  pageCount?: number;
  /** Size of the book folder on disk (images, PDF, JSON). */
  sizeBytes?: number;
  createdAt: string; // ISO
  /** The sites the book is online on, each with the date it was put there (ISO). */
  sites?: Partial<Record<PublishSite, { publishedAt: string }>>;
  /** A publish or unpublish under way on `site`: files sent to (or removed from) R2 so far. */
  publication?: {
    action: "publish" | "unpublish";
    site: PublishSite;
    done: number;
    total: number;
  };
  /** Why the last publish or unpublish failed (on `site`): code and a French message for the team. */
  publicationError?: { code: string; message: string; site?: PublishSite };
}

/** The sites a book is online on, in PUBLISH_SITES order. */
export function publishedSites(book: Pick<BookRecord, "sites">): PublishSite[] {
  return PUBLISH_SITES.filter((site) => book.sites?.[site] !== undefined);
}
