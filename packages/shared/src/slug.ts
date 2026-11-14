/** Lowercase, accents removed, only a-z, 0-9 and single dashes. May return "". */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True for a slug as `slugify` makes them (non-empty, a-z 0-9 and single inner dashes). */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 120 && slugify(slug) === slug;
}

/**
 * `base` if free, else `base-2`, `base-3`, … (first free one).
 * `taken` is compared as-is (slugs are already lowercase).
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || "flipbook";
  if (!taken.has(root)) return root;
  // "brochure-2" taken too: continue from its number rather than appending "-2-2".
  const match = /^(.*?)-(\d+)$/.exec(root);
  const stem = match ? match[1]! : root;
  let n = match ? Number(match[2]) + 1 : 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}
