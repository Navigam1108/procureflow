import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.STANDALONE_BUILD === "true" ? "standalone" : undefined,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || "http://127.0.0.1:8000"}/api/:path*`,
      },
    ];
  },
  poweredByHeader: false,
  devIndicators: false,
};
export default nextConfig;
