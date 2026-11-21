import type { NextConfig } from "next";

import { backendOrigin } from "./lib/backend";

const nextConfig: NextConfig = {
  // Cloudflare Tunnel (shared with AstraFlow) serves dev on this host
  allowedDevOrigins: ["astraflow.uknownme.online"],
  async rewrites() {
    return [
      ...["auth", "agent", "overlay"].map((prefix) => ({
        source: `/${prefix}/:path*`,
        destination: `${backendOrigin}/${prefix}/:path*`,
      })),
    ];
  },
  experimental: {
    agentFeedback: true,
    proxyTimeout: 560000,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
