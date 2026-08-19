import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Media uploads are validated separately with a 10 MB file limit.
      // Keep a little multipart/FormData overhead above that limit so the
      // request reaches the application-level image validation instead of
      // failing at Next.js' default 1 MB Server Action request limit.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
