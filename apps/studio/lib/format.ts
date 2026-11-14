/** "7,3 Mo" (French units, decimal comma). */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`;
}

/** "14 nov. 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "1 flipbook", "0 flipbook", "3 flipbooks" (French: 0 and 1 are singular). */
export function flipbookCount(n: number): string {
  return `${n} ${n > 1 ? "flipbooks" : "flipbook"}`;
}

/** "12 pages", "1 page". */
export function pageCountLabel(n: number | undefined): string {
  if (n === undefined) return "—";
  return `${n} ${n > 1 ? "pages" : "page"}`;
}

/** URL of a book file served by the /files route. */
export function bookFileUrl(bookId: string, file: string): string {
  return `/files/${bookId}/${file}`;
}

/** Page 1's standard image ("pages/001.webp", or 0001 for books of 1000+ pages). */
export function coverUrl(bookId: string, pageCount: number | undefined): string {
  const pad = Math.max(3, String(pageCount ?? 1).length);
  return bookFileUrl(bookId, `pages/${"1".padStart(pad, "0")}.webp`);
}
