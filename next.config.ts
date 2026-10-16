import type { NextConfig } from 'next';

// Static export: no server, no env vars, no runtime network calls.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // demo/index.html rather than demo.html, so a plain file server can serve /demo/.
  trailingSlash: true,
  // Don't write an AGENTS.md into the repo on `next dev`.
  agentRules: false,
  // No dev badge in screenshots or on a shared dev link.
  devIndicators: false,
};

export default nextConfig;
