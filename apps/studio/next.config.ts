import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Studio runs on the office LAN: let other devices on private networks use the dev server.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  // Don't generate AGENTS.md on `next dev`; CLAUDE.md is the project brief.
  agentRules: false,
};

export default nextConfig;
