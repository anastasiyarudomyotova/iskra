import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["*.e2b.app"],
  cacheComponents: true,
  partialPrefetching: true,
  // API payloads must not enter development request/fetch logs or be forwarded
  // from the browser console. Route errors are deliberately content-free.
  logging: {
    incomingRequests: false,
    fetches: { fullUrl: false, hmrRefreshes: false },
    serverFunctions: false,
    browserToTerminal: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
