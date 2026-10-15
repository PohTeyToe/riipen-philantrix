import type { NextConfig } from 'next';

// Static export: no server, no env vars, no runtime network calls.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: false,
  // Don't write an AGENTS.md into the repo on `next dev`.
  agentRules: false,
};

export default nextConfig;
