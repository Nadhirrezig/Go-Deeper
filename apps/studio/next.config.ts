import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The team keeps one `.env` at the repo root (see .env.example); Next.js itself only reads
// apps/studio/.env. Load the root one too. Variables already set (shell, pm2) win.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Studio runs on the office LAN: let other devices on private networks use the dev server.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  // Don't generate AGENTS.md on `next dev`; CLAUDE.md is the project brief.
  agentRules: false,
};

export default nextConfig;
