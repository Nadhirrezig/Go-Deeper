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

Run one package only: `pnpm --filter @vipgroup/flipbook test` (or `build`, `lint`, …).

## Open the studio from another device (office Wi-Fi)

1. `pnpm dev` (or `pnpm build && pnpm start`) on the office PC.
2. Find the PC's IP: `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/macOS).
3. On the other device: `http://<pc-ip>:3000`.

If it does not load, allow port 3000 in the PC's firewall. In dev mode, private LAN addresses
(`192.168.*`, `10.*`, `172.*`, `*.local`) are allowed in `apps/studio/next.config.ts` →
`allowedDevOrigins`.
