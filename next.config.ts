import type { NextConfig } from "next";

const selfHostedBuild = process.env.SELF_HOSTED_BUILD === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Produce a Linux-deployable runtime bundle that contains only the files
  // traced by Next.js. `public/` and `.next/static/` are added by the
  // package:self-hosted script because Next intentionally leaves them out of
  // the standalone directory.
  ...(selfHostedBuild ? { output: "standalone" as const } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/content/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "CDN-Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Eo-Cdn-Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
