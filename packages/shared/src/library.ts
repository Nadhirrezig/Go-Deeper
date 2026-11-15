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
  /** When the book was put on goexperience.travel (ISO); absent while it is not published. */
  publishedAt?: string;
  /** A publish or unpublish under way: files sent to (or removed from) R2 so far. */
  publication?: { action: "publish" | "unpublish"; done: number; total: number };
  /** Why the last publish or unpublish failed: code and a French message for the team. */
  publicationError?: { code: string; message: string };
}
