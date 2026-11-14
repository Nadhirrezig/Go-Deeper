#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { bookStats, formatBytes } from "./book-stats";
import { convertPdf, DEFAULT_CONCURRENCY } from "./convert";
import { ConverterError } from "./errors";
import { version } from "./index";

// `pnpm convert` runs from the repo root; INIT_CWD is where the user typed the command.
const userCwd = process.env.INIT_CWD ?? process.cwd();
const DEFAULT_OUT = path.join("storage", "flipbooks");

function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError("Must be a positive integer.");
  return n;
}

const program = new Command()
  .name("vipgroup-convert")
  .description("Convert a PDF into a flipbook folder (WebP pages + manifest.json + search.json).")
  .version(version)
  .argument("<file.pdf>", "PDF to convert")
  .option("--out <dir>", "parent folder for the book", DEFAULT_OUT)
  .option("--title <title>", "book title (default: PDF metadata title, else file name)")
  .option("--slug <slug>", "URL slug (default: slugified title)")
  .option("--concurrency <n>", "pages rendered in parallel", positiveInt, DEFAULT_CONCURRENCY)
  .showHelpAfterError();

program.parse();

const [file] = program.args as [string];
const opts = program.opts<{ out: string; title?: string; slug?: string; concurrency: number }>();

const input = path.resolve(userCwd, file);
// The default --out is relative to the repo root (pnpm's cwd); a user value to where they typed.
const outDir =
  opts.out === DEFAULT_OUT
    ? path.resolve(process.cwd(), opts.out)
    : path.resolve(userCwd, opts.out);

if (!existsSync(input)) {
  console.error(`Error: file not found: ${input}`);
  process.exit(1);
}

const controller = new AbortController();
process.once("SIGINT", () => {
  process.stdout.write("\nAborting… (cleaning up)\n");
  controller.abort();
});

const tty = process.stdout.isTTY === true;
let lastLine = "";
const show = (line: string): void => {
  if (line === lastLine) return;
  lastLine = line;
  if (tty) process.stdout.write(`\r${line}\x1b[K`);
  else console.log(line);
};

try {
  console.log(`Converting ${input}`);
  const result = await convertPdf(input, {
    outDir,
    title: opts.title,
    slug: opts.slug,
    concurrency: opts.concurrency,
    signal: controller.signal,
    onProgress: ({ stage, page, total }) => {
      if (stage === "render") show(`page ${page}/${total}`);
      if (stage === "write") show(`writing manifest…`);
    },
  });
  if (tty) process.stdout.write("\n");

  const { manifest, dir, warnings, durationMs } = result;
  const stats = await bookStats(dir);
  const seconds = durationMs / 1000;
  const lines = [
    "",
    "Done.",
    `  Book folder : ${dir}`,
    `  Title       : ${manifest.title}  (slug: ${manifest.slug})`,
    `  Pages       : ${manifest.pageCount}  (${manifest.pageWidth}×${manifest.pageHeight} px standard)`,
    `  Thumb       : ${formatBytes(stats.thumb)}`,
    `  Standard    : ${formatBytes(stats.standard)}`,
    `  Zoom        : ${formatBytes(stats.zoom)}`,
    `  PDF + JSON  : ${formatBytes(stats.other)}`,
    `  Total       : ${formatBytes(stats.total)}`,
    `  Duration    : ${seconds.toFixed(1)} s  (${(seconds / manifest.pageCount).toFixed(2)} s/page)`,
    `  Warnings    : ${warnings.length === 0 ? "none" : warnings.length}`,
    ...warnings.map((w) => `    - ${w}`),
  ];
  console.log(lines.join("\n"));
} catch (error) {
  if (tty && lastLine) process.stdout.write("\n");
  if (error instanceof ConverterError) {
    console.error(`Error [${error.code}]: ${error.message}`);
  } else {
    console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
}
