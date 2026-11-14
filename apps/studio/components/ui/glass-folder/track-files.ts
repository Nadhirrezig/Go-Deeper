import type { FolderFile } from "./types";

/**
 * The folder's list, with a stable numeric id per file so a sheet keeps its
 * identity across updates. A file is recognised by its `id`, or, without one,
 * by its position and name.
 */
export type Tracked = { files: FolderFile[]; keys: string[]; ids: number[]; next: number };

export const fileKey = (file: FolderFile, index: number): string =>
  file.id != null ? "id:" + file.id : "at:" + index + ":" + file.name;

/** Pure: the same files keep their ids, new ones get the next ids. */
export function track(prev: Tracked | null, files: FolderFile[]): Tracked {
  const known = new Map<string, number>();
  if (prev) prev.keys.forEach((key, i) => known.set(key, prev.ids[i]!));
  let next = prev ? prev.next : 0;
  const keys = files.map(fileKey);
  const ids = keys.map((key) => {
    const found = known.get(key);
    if (found !== undefined) return found;
    const id = next++;
    known.set(key, id);
    return id;
  });
  return { files, keys, ids, next };
}
