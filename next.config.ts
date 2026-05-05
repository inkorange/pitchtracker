import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      // MLB headshot CDN
      { protocol: "https", hostname: "img.mlbstatic.com" },
      // MLB team logo CDN
      { protocol: "https", hostname: "www.mlbstatic.com" },
    ],
  },
};

export default nextConfig;
