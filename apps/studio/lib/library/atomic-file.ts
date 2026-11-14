import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Errors Windows returns while another process (OneDrive, antivirus) holds the file. */
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY"]);
const RETRY_DELAYS_MS = [50, 100, 200, 400, 800];

let counter = 0;

/**
 * Replace `file` in one step: write a temp file next to it, then rename over it. A reader
 * (or a crash) sees the old or the new content, never half a file.
 */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${++counter}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ temp, content, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(/*turbopackIgnore: true*/ temp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      const delay = RETRY_DELAYS_MS[attempt];
      if (!TRANSIENT.has(code) || delay === undefined) {
        await rm(/*turbopackIgnore: true*/ temp, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** File content, or null when it does not exist yet. */
export async function readFileIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(/*turbopackIgnore: true*/ file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Runs tasks one after another, in call order (a failed task does not block the next). */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
