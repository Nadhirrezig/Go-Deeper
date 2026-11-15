# VipGroup App

Internal tool for **VIP Group** (GO Experience, VIP Visa, VIP Destinations), built by **SSI**.
Current module: **Flipbooks** — upload a PDF, convert it to a page-flip book, show it on goexperience.travel.

## Requirements

- Node.js 22 LTS (`nvm use` reads `.nvmrc`)
- pnpm 10 — enable it with `corepack enable` (version pinned in `package.json` → `packageManager`)
- Office PC: Docker Desktop (see "Run the studio with Docker")

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

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm dev`           | Builds the packages, then runs studio in dev mode on `0.0.0.0:3000` |
| `pnpm build`         | Builds shared, converter, flipbook (tsup) and studio (`next build`) |
| `pnpm start`         | Runs the built studio on `0.0.0.0:3000` (run `pnpm build` first)    |
| `pnpm typecheck`     | `tsc --noEmit` in every package                                     |
| `pnpm lint`          | ESLint in every package                                             |
| `pnpm test`          | Vitest in every package that has tests                              |
| `pnpm format`        | Prettier — rewrite all files                                        |
| `pnpm format:check`  | Prettier — check only                                               |
| `pnpm convert …`     | Converts a PDF into a flipbook folder (see below)                   |
| `pnpm pack:flipbook` | Builds the reader package file for goexperience (see below)         |

Run one package only: `pnpm --filter @vipgroup/flipbook test` (or `build`, `lint`, …).

The studio's PostgreSQL tests are skipped unless `TEST_DATABASE_URL` points at a server. With a
throwaway one in Docker (each a single command):

```bash
docker run -d --name vgf-test-db -e POSTGRES_PASSWORD=test -p 127.0.0.1:5433:5432 postgres:16-alpine
$env:TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:5433/postgres"; pnpm --filter @vipgroup/studio test
docker rm -f vgf-test-db
```

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
  `INVALID_PDF`, `PASSWORD_PROTECTED`, `EMPTY_PDF`, `TOO_LARGE` (limit 15 MB, fixed),
  `TOO_MANY_PAGES` (limit 500), `OUT_DIR_EXISTS`, `ABORTED`.

Example:

```bash
pnpm convert ~/Downloads/brochure.pdf --title "Test brochure"
```

Library use: `import { convertPdf } from "@vipgroup/converter"`. The studio runs each conversion
in a child process with `@vipgroup/converter/worker` (built by `pnpm build`).

## Run the studio with Docker (office PC)

On the office PC the studio runs with Docker Compose, which replaces pm2: a `studio` container, a
`postgres` container (PostgreSQL 16) holding the library, and an `https` container (Caddy) that
serves it at **https://studio.vipgroup.lan** (see "HTTPS on the office network" below). It needs Docker Desktop (WSL 2 backend)
with **Settings → General → Start Docker Desktop when you sign in** ticked, so both come back by
themselves after a reboot.

Once, before the first start: in the repo's `.env`, set `POSTGRES_PASSWORD` (letters and digits).
It is fixed when the database is created; changing it later does not change it there.

From the repo root, in PowerShell:

```bash
docker compose up -d --build
```

- The first build takes a few minutes. Then open https://studio.vipgroup.lan (set up once as
  described in "HTTPS on the office network"). If Windows asks, allow Docker Desktop on private
  networks.
- Ports 80 and 443 must be free on the office PC (stop IIS or any other web server). The studio
  is no longer reachable on port 3000; stop any studio started before with pm2 (`pm2 list`, then
  `pm2 delete <name>`) or with `pnpm start`.
- Settings come from the repo's `.env` (R2 keys, `GOEXPERIENCE_URL`, `POSTGRES_PASSWORD`), read
  when the containers start: after changing it, run `docker compose up -d` again. `STORAGE_DIR`,
  `FLIPBOOKS_DIR` and `PG*` from `.env` are ignored in Docker.
- The library (folders, books, publication state) is in PostgreSQL, volume
  `vipgroup_postgres-data`; the database is not reachable from the network, only by the studio.
  The converted books and uploads are in the volume `vipgroup_studio-data`, mounted at `/data`.
  Both survive restarts, rebuilds and `docker compose down`; `docker compose down -v` **deletes
  them**.
- The first start with PostgreSQL moves an existing `library.json` (from the studio's earlier
  Docker setup) into the database, once, and renames it `library.json.imported`. The log says
  `imported library.json (…)`.

| Task                    | Command                                        |
| ----------------------- | ---------------------------------------------- |
| State                   | `docker compose ps`                            |
| Logs                    | `docker compose logs -f studio`                |
| Update after `git pull` | `docker compose up -d --build`                 |
| Stop / start again      | `docker compose stop` / `docker compose start` |

`docker compose ps` shows `studio` and `postgres` healthy and `https` up; `ca` is listed only
with `docker compose ps -a`, exited (0): it runs at each start to check the certificate authority.

**Back up** (database, books and certificate authority; preferably when nobody is converting or
publishing), one command after the other, into a folder of your choice:

```bash
docker compose exec postgres pg_dump -U vipgroup -d vipgroup --clean --if-exists -f /tmp/library.sql
docker compose cp postgres:/tmp/library.sql C:\VipGroupBackups\2026-11-15\library.sql
docker compose cp studio:/data C:\VipGroupBackups\2026-11-15\data
docker compose cp https:/ca C:\VipGroupBackups\2026-11-15\ca
```

**Restore** a backup (replaces the current library and books):

```bash
docker compose cp C:\VipGroupBackups\2026-11-15\library.sql postgres:/tmp/library.sql
docker compose exec postgres psql -U vipgroup -d vipgroup -f /tmp/library.sql
docker compose cp C:\VipGroupBackups\2026-11-15\data\. studio:/data
docker compose exec -u root studio chown -R node:node /data
docker compose restart studio
```

Restore the certificate authority only if its volume was lost (on a new PC, or after
`docker compose down -v`); otherwise every PC would need the certificate again. Before the first
`docker compose up`:

```bash
docker compose create ca
docker compose cp C:\VipGroupBackups\2026-11-15\ca\. ca:/ca
docker compose up -d --build
```

## HTTPS on the office network

The studio is served at **https://studio.vipgroup.lan**. Every `http://` address (by name or by
IP) redirects to it, except the certificate page. The certificate comes from the studio's own
certificate authority, created on the first `docker compose up` (`https/make-ca.sh`):

- it can only vouch for `studio.vipgroup.lan`, never for another site (name constraint);
- its root private key is deleted right after creation; Caddy issues and renews the site
  certificate by itself;
- it lasts 10 years; then the certificate must be installed again on each PC.

**Once, on the office network:**

1. Give the office PC a fixed IP (DHCP reservation on the router): the installer defaults to
   `192.168.1.10`.
2. On the office PC, allow ports 80 and 443 (PowerShell as administrator):

```bash
New-NetFirewallRule -DisplayName "VipGroup studio (HTTP/HTTPS)" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Private
```

**On each PC** (Chrome or Edge): open **http://studio.vipgroup.lan/certificat** (or
`http://192.168.1.10/certificat`), download the installer, run it, answer **Oui** to Windows'
question, then restart the browser. The installer needs administrator rights: it installs the
certificate machine-wide and maps `studio.vipgroup.lan` to `192.168.1.10` in the Windows hosts
file. If the office PC has a different fixed IP, edit `SERVER_IP` in `https/make-ca.sh`, then run
`docker compose up -d --build ca` before downloading the installer. The page also offers the `.cer`
file for a manual install and shows the certificate's fingerprint. Firefox keeps its own list:
set `security.enterprise_roots.enabled` to `true` in `about:config`.

To remove it from a PC, run PowerShell as administrator:
`certutil -delstore Root "VipGroup Studio CA (studio.vipgroup.lan)"`.

**Another name:** set `STUDIO_HOST` in `.env`, then (the authority is made for one name):

```bash
docker compose down
docker volume rm vipgroup_ca vipgroup_caddy-data
docker compose up -d
```

and install the new certificate on every PC (remove the old one first).

## Use the studio

On the office PC it runs with Docker (above). For development, start it with `pnpm dev` (or
`pnpm build && pnpm start` for production speed) and open http://localhost:3000, or
`http://<pc-ip>:3000` from another device on the office network.

- **Home**: the Flipbooks card (Blogs comes later).
- **Flipbooks** (`/flipbooks`): one glass folder per folder. Click a folder to fan out its
  flipbooks (covers); click one to open it. The `···` key of a folder: **Nouveau flipbook**
  (upload a PDF into it), **Renommer**, **Supprimer** (only when empty, never the last folder).
  The dashed folder with `+` at the end creates a folder. A first run creates "Général".
- **Nouveau flipbook**: drop or choose a PDF (15 MB at most, a fixed limit); the title comes from the file name and the slug
  from the title (a slug already used gets `-2`, `-3`…). **Convertir** shows the upload %, then
  "Page X / Y". You can close the window: the flipbook shows "Conversion X/Y" in its folder and
  drops in when it is ready. Uploads are converted one at a time, in order.
- **Folder page** (`/flipbooks/folders/<id>`): every flipbook of the folder, newest first; failed
  conversions can be removed there.
- **Flipbook page** (`/flipbooks/<id>`): the reader, the details, **Télécharger le PDF** and
  **Supprimer** (removes the record and its files; refused while the book is online).
- **Site goexperience.travel** (on the flipbook page): **Publier sur le site** uploads the book to
  Cloudflare R2 and lists it on goexperience.travel (progress "X/Y fichiers"; the site shows it
  within about a minute, at `/fr/flipbook/<first 8 characters of the id>`). Once online: **Voir sur
  le site**, the link to share, and **Dépublier** (off the site's list first, then its files are
  deleted from R2). An error is shown in French on the card; starting again is always safe. Online
  books carry an "En ligne" badge in their folder.

Books converted with `pnpm convert` appear in "Général" the next time the studio starts. A
conversion cut short by stopping the studio is shown as "Conversion interrompue".

Storage (all under `storage/`, never committed): `library.json` (folders and books, when no
PostgreSQL is configured: with Docker the library is in PostgreSQL), `flipbooks/<id>/` (converted
books, served by `/files/<id>/…`) and `uploads/` (PDFs waiting for conversion, emptied as they
finish).

| Variable                                                         | Default                       | Meaning                                                   |
| ---------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| `STORAGE_DIR`                                                    | `<repo>/storage`              | Folder for library.json, books and uploads                |
| `FLIPBOOKS_DIR`                                                  | `<storage>/flipbooks`         | Only the converted books, elsewhere                       |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`      | none                          | Cloudflare R2 token the studio publishes with (see below) |
| `R2_BUCKET`                                                      | `goexperience`                | R2 bucket goexperience.travel reads                       |
| `GOEXPERIENCE_URL`                                               | `https://goexperience.travel` | Site address for "Voir sur le site" and share links       |
| `POSTGRES_PASSWORD`                                              | none (required by Docker)     | Password of the studio's PostgreSQL database              |
| `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` or `DATABASE_URL` | none                          | Outside Docker: use PostgreSQL instead of library.json    |

Set them in `.env` (see `.env.example`).

**Cloudflare R2.** Published books go to `flipbooks/<id>/` in the private R2 bucket that
goexperience.travel reads (setup: the "Cloudflare R2 setup guide" doc). The studio signs its
requests itself (`apps/studio/lib/r2/`, no SDK) with its own token: "Object Read & Write" on the
`goexperience` bucket only. **Publier / Dépublier** (flipbook page) use it.

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

### Reader package file (for goexperience.travel)

The reader is not published to any registry. It ships as a package file:

```bash
pnpm pack:flipbook
```

- Builds the reader and writes `release/vipgroup-flipbook-<version>.tgz` (git-ignored here).
- goexperience commits that file under `vendor/` and depends on
  `"@vipgroup/flipbook": "file:vendor/vipgroup-flipbook-<version>.tgz"`. Its only dependency is
  `page-flip` (from npm); React 18 or 19 comes from the host app; the types are self-contained.
- To ship a reader change: raise `version` in `packages/flipbook/package.json`, run
  `pnpm pack:flipbook`, replace the file in goexperience's `vendor/` and update the dependency.

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

With Docker, use https://studio.vipgroup.lan (see "HTTPS on the office network"). Without Docker:

1. `pnpm dev` (or `pnpm build && pnpm start`) on the office PC.
2. Find the PC's IP: `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/macOS).
3. On the other device: `http://<pc-ip>:3000`.

If it does not load, allow port 3000 in the PC's firewall. In dev mode, private LAN addresses
(`192.168.*`, `10.*`, `172.*`, `*.local`) are allowed in `apps/studio/next.config.ts` →
`allowedDevOrigins`.
