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

Library use: `import { convertPdf } from "@vipgroup/converter"`. The studio runs each conversion
in a child process with `@vipgroup/converter/worker` (built by `pnpm build`).

## Use the studio

Start it with `pnpm dev` (or `pnpm build && pnpm start` for production speed) and open
http://localhost:3000, or `http://<pc-ip>:3000` from another device on the office network.

- **Home**: the Flipbooks card (Blogs comes later).
- **Flipbooks** (`/flipbooks`): one glass folder per folder. Click a folder to fan out its
  flipbooks (covers); click one to open it. The `···` key of a folder: **Nouveau flipbook**
  (upload a PDF into it), **Renommer**, **Supprimer** (only when empty, never the last folder).
  The dashed folder with `+` at the end creates a folder. A first run creates "Général".
- **Nouveau flipbook**: drop or choose a PDF; the title comes from the file name and the slug
  from the title (a slug already used gets `-2`, `-3`…). **Convertir** shows the upload %, then
  "Page X / Y". You can close the window: the flipbook shows "Conversion X/Y" in its folder and
  drops in when it is ready. Uploads are converted one at a time, in order.
- **Folder page** (`/flipbooks/folders/<id>`): every flipbook of the folder, newest first; failed
  conversions can be removed there.
- **Flipbook page** (`/flipbooks/<id>`): the reader, the details, **Télécharger le PDF** and
  **Supprimer** (removes the record and its files).

Books converted with `pnpm convert` appear in "Général" the next time the studio starts. A
conversion cut short by stopping the studio is shown as "Conversion interrompue".

Storage (all under `storage/`, never committed): `library.json` (folders and books, until
PostgreSQL in step 6), `flipbooks/<id>/` (converted books, served by `/files/<id>/…`) and
`uploads/` (PDFs waiting for conversion, emptied as they finish).

| Variable        | Default               | Meaning                                    |
| --------------- | --------------------- | ------------------------------------------ |
| `MAX_UPLOAD_MB` | `200`                 | Largest PDF the studio accepts, in MB      |
| `STORAGE_DIR`   | `<repo>/storage`      | Folder for library.json, books and uploads |
| `FLIPBOOKS_DIR` | `<storage>/flipbooks` | Only the converted books, elsewhere        |

Set them in `.env` (see `.env.example`).

Tip: keep the repo (and so `storage/`) outside OneDrive or other synced folders — every book
adds hundreds of image files, which slows conversion and can lock files during sync.

## Use the reader in a React / Next.js app

```tsx
import { Flipbook, labelsEn } from "@vipgroup/flipbook";
import "@vipgroup/flipbook/styles.css";

<Flipbook manifestUrl="https://cdn.example.com/flipbooks/<id>/manifest.json" />;
// or: <Flipbook manifest={manifest} baseUrl="https://cdn.example.com/flipbooks/<id>/" />
// options: startPage, sound, labels (French by default, labelsEn exported), className,
//          download, search, onPageChange(page), onReady(manifest)
```

Works in a Next.js server page without `dynamic(..., { ssr: false })`. The reader fills the
width of its container; its height hugs the book up to 85vh, or set one with `className`.
Theme it with the `--vgf-*` CSS variables listed at the top of
`packages/flipbook/src/styles.css`.

| Prop       | Default | Effect                                                                    |
| ---------- | ------- | ------------------------------------------------------------------------- |
| `download` | `true`  | Toolbar button that downloads the original PDF as `<slug>.pdf`            |
| `search`   | `true`  | Toolbar button and in-book search (`search.json` is loaded on first open) |

Search ignores case and accents (`ete` finds "Été") and Arabic harakat; with several words it
finds pages containing all of them. It opens as a side panel when the reader is at least 720px
wide, as a bottom sheet below that.

Reader keys (only while the reader has focus): ← → turn · Home / End · + / − zoom ·
Ctrl/Cmd+F search (↑ ↓ choose a result, Enter opens it) · Esc closes search, zoom, thumbnails or
full screen. Outside the reader, Ctrl/Cmd+F stays the browser's own find.

## Open the studio from another device (office Wi-Fi)

1. `pnpm dev` (or `pnpm build && pnpm start`) on the office PC.
2. Find the PC's IP: `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/macOS).
3. On the other device: `http://<pc-ip>:3000`.

If it does not load, allow port 3000 in the PC's firewall. In dev mode, private LAN addresses
(`192.168.*`, `10.*`, `172.*`, `*.local`) are allowed in `apps/studio/next.config.ts` →
`allowedDevOrigins`.
