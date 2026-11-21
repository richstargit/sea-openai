import type { NextConfig } from "next";

import { backendOrigin, liveDetectOrigin } from "./lib/backend";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      ...["auth", "agent", "overlay"].map((prefix) => ({
        source: `/${prefix}/:path*`,
        destination: `${backendOrigin}/${prefix}/:path*`,
      })),
      { source: "/live-api/:path*", destination: `${liveDetectOrigin}/api/:path*` },
      { source: "/live-images/:path*", destination: `${liveDetectOrigin}/images/:path*` },
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
