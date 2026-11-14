# VipGroup App — Claude Code brief

Internal tool for the client **VIP Group** (GO Experience, VIP Visa, VIP Destinations), built by **SSI (Sécurités & Solutions Informatiques)**.

## Roles

- **Claude (chat)** directs: writes the plan and one step prompt at a time.
- **Claude Code (you)** implements exactly the current step, nothing beyond it.
- **Nadhir** validates each step against its checklist, reviews code, and owns UI polish.

Rules for you:
- Work only on the step you were given. If you see something worth doing later, list it under "Notes for next steps" in your final message — do not build it.
- Ask before adding any dependency not listed in this file.
- Never commit secrets. Every new env var goes into `.env.example` with a comment.
- End every step with: what you built, how to test it (exact commands), and any open issues.
- Keep commits small, one per logical change, message in English, imperative mood.

## What we are building now: Module 2 — Flipbooks

A Heyzine-style tool: the team uploads a PDF, the app converts it into a page-flip book, and goexperience.travel shows it to visitors. Module 1 (blog review) comes later — do not start it.

### Roadmap (do not jump ahead)

| Step | Content |
| --- | --- |
| 1 | Monorepo scaffold, tooling, empty packages |
| 2 | `@vipgroup/converter`: PDF → WebP pages (3 sizes) + `manifest.json` + `search.json`, with a CLI |
| 3 | `@vipgroup/flipbook` reader core: flip + sound, double/single page, thumbnails, zoom, fullscreen, keyboard/swipe, lazy loading |
| 4 | Reader: PDF download + in-book search |
| 5 | Studio: home, folders, upload + progress, folder and flipbook pages |
| 6 | Cloud storage + PostgreSQL: upload books, folders table, draft / published status |
| 7 | goexperience.travel integration: package published, `/flipbook/[slug]` route, `<Flipbook />` |
| Later | Branding per book · Interactive pages (links, hotspots, video, table of contents) · Sharing & protection (share, page links, embed code, password, stats) |

## Architecture

```
vipgroup-app/                 pnpm workspace
├─ apps/
│  └─ studio/                 Next.js app (App Router) — runs on ONE office machine, LAN only
├─ packages/
│  ├─ converter/              Node library + CLI: PDF → images + manifest + search index
│  ├─ flipbook/               React reader component, shipped to goexperience.travel
│  └─ shared/                 Shared TypeScript types (FlipbookManifest, etc.)
├─ CLAUDE.md
└─ README.md
```

- **studio** is never deployed publicly. It runs on the office LAN (`next start -H 0.0.0.0`, kept alive with pm2).
- **converter** runs inside studio (server side) and from the CLI. Heavy work stays on the office machine.
- **flipbook** must work in any React 18/19 + Next.js app without the host's Tailwind config. It is consumed by studio (preview) and by goexperience.travel (installed as a private package from GitHub Packages — set up in step 7).
- Public files (images, PDF, `manifest.json`, `search.json`) live in cloud storage behind a CDN (step 6). Until then, they live in a local folder (`./storage/flipbooks/<id>/`).

### Book output format (contract between converter and reader)

```
flipbooks/<id>/
  manifest.json      FlipbookManifest
  search.json        [{ "page": 1, "text": "..." }, ...]  (loaded only when search opens)
  original.pdf
  pages/
    001-thumb.webp     ~200 px wide
    001.webp           ~1000 px wide (default view)
    001-zoom.webp      ~2000 px wide (zoom)
```

`FlipbookManifest` (in `packages/shared`):
```ts
export interface FlipbookManifest {
  version: 1;
  id: string;            // uuid
  slug: string;
  title: string;
  pageCount: number;
  pageWidth: number;     // px of the standard image, page 1
  pageHeight: number;
  pdf: string;           // relative path, e.g. "original.pdf"
  search: string;        // relative path, e.g. "search.json"
  pages: { n: number; thumb: string; standard: string; zoom: string }[];
  createdAt: string;     // ISO
}
```
All paths in the manifest are relative to the manifest's own URL. The reader resolves them against a `baseUrl`. Change this contract only when a step says so.

## Notes for step 6

- Upload `original.pdf` with `Content-Disposition: attachment; filename="<slug>.pdf"`. The reader's
  Download button is a plain link with a `download` attribute, which browsers ignore on
  cross-origin URLs (the CDN): this header is what names the file and forces the download there.

## Stack and approved dependencies

- Node.js 22 LTS, pnpm 9+, TypeScript `strict`
- **studio**: Next.js (latest stable, App Router), Tailwind CSS v4, React 19
- **converter**: `pdfjs-dist` (render + text), `@napi-rs/canvas` (Node canvas for pdfjs), `sharp` (WebP), `commander` (CLI)
- **flipbook**: `page-flip` (StPageFlip, MIT). Built with `tsup`. Styles in one plain CSS file, every class prefixed `vgf-`, theming through CSS variables (`--vgf-*`). Do NOT use turn.js (paid licence).
- Testing: `vitest`
- Lint/format: ESLint + Prettier
- Pinned in step 1: Next.js 16, React 19, TypeScript 6.0.x (typescript-eslint does not support TS 7 yet), ESLint 9 (Next's ESLint plugins do not support ESLint 10 yet).

## Conventions

- File names kebab-case; React components PascalCase.
- No `any`. Shared types live in `packages/shared`.
- Studio UI text in French (the team works in French); code, comments and commits in English.
- Client components only where needed (`"use client"` at the top of the reader entry).
- Accessibility: keyboard works everywhere, buttons have labels, focus is visible.
- `apps/studio/components/ui/glass-folder.tsx` (and its `glass-folder/` modules, `new-folder-tile.tsx`): design owned by Nadhir: change only on request.

## Commands (root)

- `pnpm dev` — studio in dev mode
- `pnpm build` — build all packages and studio
- `pnpm typecheck` · `pnpm lint` · `pnpm test`
- `pnpm convert <file.pdf> --out <dir>` — converter CLI (from step 2)

## Definition of done (every step)

1. `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` pass with no errors.
2. The step's checklist can be followed by Nadhir with the exact commands you give.
3. README updated if commands or setup changed.
4. Work committed.
