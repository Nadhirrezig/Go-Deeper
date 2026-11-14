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
- Book files (images, PDF, `manifest.json`, `search.json`) go to the private Cloudflare R2 bucket used by goexperience.travel, which serves them through its own `/api/r2` route (step 6, see notes below). Until then, they live in a local folder (`./storage/flipbooks/<id>/`).

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

## Notes for step 6 — storage decided: Cloudflare R2, private bucket ("option A")

- Use the existing R2 bucket `goexperience` (the one goexperience.travel already uses). It stays
  private: no public access, no r2.dev address, no custom domain, no CORS rule.
- Each book goes to `flipbooks/<id>/` with exactly the "Book output format" layout above. Upload
  every file with its Content-Type (`application/json`, `image/webp`, `application/pdf`).
- The studio writes with its own R2 API token: "Object Read & Write", limited to the `goexperience`
  bucket. Nadhir creates it in the Cloudflare dashboard (R2 → Manage API tokens); the keys live only
  in the office PC's `.env` (variable names in `.env.example`), never in chat or in git.
- Signing: goexperience's `src/lib/r2.ts` signs R2 requests (SigV4) with `node:crypto` only. Reuse
  that approach for PUT / DELETE if possible; ask before adding an S3 SDK.
- The Cloudflare connector ("Developer Platform") can list and inspect buckets, but cannot upload
  files, create tokens or change bucket settings.

## Notes for step 7 — goexperience.travel (repo `Nadhirrezig/Go-expereince-Travel`)

- Next.js 16 + React 19 + next-intl, deployed on Vercel. It reads the private bucket through
  `src/app/api/r2/[...key]/route.ts` (signed GET), which today allows only `journeys/` and images.
- Extend that route for `flipbooks/`: allow `.json`, `.webp`, `.pdf`, keep the `..` check; cache
  pages and the PDF as immutable; send `original.pdf` with
  `Content-Disposition: attachment; filename="<slug>.pdf"`.
- The reader uses same-origin URLs: `<Flipbook manifestUrl="/api/r2/flipbooks/<id>/manifest.json" />`.
  No CORS is needed, and the Download button's `download` attribute works (same origin).
- The site's existing read token already covers `flipbooks/` (R2 tokens apply to a whole bucket).
- Leave `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` unset: it would make the site expect a public bucket.
- Trade-off of a private bucket: every page image passes through a Vercel function. Check that
  Vercel caches these responses (each image fetched from R2 once), and watch Vercel usage after launch.

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
