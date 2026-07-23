import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/content/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        { key: "CDN-Cache-Control", value: "public, max-age=31536000, immutable" },
        { key: "Eo-Cdn-Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    }];
  },
};

export default nextConfig;
