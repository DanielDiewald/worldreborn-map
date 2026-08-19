import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // WorldReborn accepts media files up to 50 MB by default.
      // Keep the Server Action request limit slightly higher to allow for
      // multipart/FormData overhead before application-level validation runs.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
