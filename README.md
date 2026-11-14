# VipGroup App

Internal tool for **VIP Group** (GO Experience, VIP Visa, VIP Destinations), built by **SSI**.
Current module: **Flipbooks** — upload a PDF, convert it to a page-flip book, show it on goexperience.travel.

## Requirements

- Node.js 22 LTS (`nvm use` reads `.nvmrc`)
- pnpm 10 — enable it with `corepack enable` (version pinned in `package.json` → `packageManager`)

## Structure

```
apps/studio/          Next.js app (App Router) — office LAN only
packages/converter/   PDF → images + manifest + search index (library + CLI)
packages/flipbook/    React reader component (+ @vipgroup/flipbook/styles.css)
packages/shared/      Shared TypeScript types (FlipbookManifest, …)
```

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env   # no variables needed yet
pnpm build
```

## Commands (from the repo root)

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `pnpm dev`          | Builds the packages, then runs studio in dev mode on `0.0.0.0:3000` |
| `pnpm build`        | Builds shared, converter, flipbook (tsup) and studio (`next build`) |
| `pnpm start`        | Runs the built studio on `0.0.0.0:3000` (run `pnpm build` first)    |
| `pnpm typecheck`    | `tsc --noEmit` in every package                                     |
| `pnpm lint`         | ESLint in every package                                             |
| `pnpm test`         | Vitest in every package that has tests                              |
| `pnpm format`       | Prettier — rewrite all files                                        |
| `pnpm format:check` | Prettier — check only                                               |
| `pnpm convert …`    | Converts a PDF into a flipbook folder (see below)                   |

Run one package only: `pnpm --filter @vipgroup/flipbook test` (or `build`, `lint`, …).

## Convert a PDF (CLI)

```bash
pnpm convert <file.pdf> [--out ./storage/flipbooks] [--title "…"] [--slug …] [--concurrency 2]
```

- No manual build needed: the command builds the converter first (~2 s).
- Default `--out` is `./storage/flipbooks` at the repo root (git-ignored). Each book goes to
  `<out>/<uuid>/` with `manifest.json`, `search.json`, `original.pdf` and `pages/NNN{-thumb,,-zoom}.webp`.
- Prints `page 12/48` progress, then a summary: folder, page count, size per image size, duration,
  warnings.
- Ctrl+C aborts and removes the half-written folder.
- Errors print one line and exit with code 1, e.g. `Error [PASSWORD_PROTECTED]: …`. Codes:
  `INVALID_PDF`, `PASSWORD_PROTECTED`, `EMPTY_PDF`, `TOO_MANY_PAGES` (limit 500), `OUT_DIR_EXISTS`,
  `ABORTED`.

Example:

```bash
pnpm convert ~/Downloads/brochure.pdf --title "Test brochure"
```

Library use (studio, step 5): `import { convertPdf } from "@vipgroup/converter"`.

## Preview books in the reader (temporary, until step 5)

1. Convert at least one PDF: `pnpm convert brochure.pdf --title "Test brochure"`.
2. Start the studio: `pnpm dev` (or `pnpm build && pnpm start` for production speed).
3. Open http://localhost:3000/dev/books (from a phone: `http://<pc-ip>:3000/dev/books`) and pick
   a book.

The studio reads books from `<repo root>/storage/flipbooks`. Set `FLIPBOOKS_DIR` in `.env` to use
another folder (see `.env.example`). Files are served by `/files/<id>/…`.

Tip: keep the repo (and so `storage/`) outside OneDrive or other synced folders — every book
adds hundreds of image files, which slows conversion and can lock files during sync.

## Use the reader in a React / Next.js app

```tsx
import { Flipbook, labelsEn } from "@vipgroup/flipbook";
import "@vipgroup/flipbook/styles.css";

<Flipbook manifestUrl="https://cdn.example.com/flipbooks/<id>/manifest.json" />;
// or: <Flipbook manifest={manifest} baseUrl="https://cdn.example.com/flipbooks/<id>/" />
// options: startPage, sound, labels (French by default, labelsEn exported), className,
//          onPageChange(page), onReady(manifest)
```

Works in a Next.js server page without `dynamic(..., { ssr: false })`. The reader fills the
width of its container; its height hugs the book up to 85vh, or set one with `className`.
Theme it with the `--vgf-*` CSS variables listed at the top of
`packages/flipbook/src/styles.css`.

Reader keys (only while the reader has focus): ← → turn · Home / End · + / − zoom · Esc closes
zoom, thumbnails or full screen.

## Open the studio from another device (office Wi-Fi)

1. `pnpm dev` (or `pnpm build && pnpm start`) on the office PC.
2. Find the PC's IP: `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/macOS).
3. On the other device: `http://<pc-ip>:3000`.

If it does not load, allow port 3000 in the PC's firewall. In dev mode, private LAN addresses
(`192.168.*`, `10.*`, `172.*`, `*.local`) are allowed in `apps/studio/next.config.ts` →
`allowedDevOrigins`.
