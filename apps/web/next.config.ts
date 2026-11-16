import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@beaver/core", "@beaver/i18n", "@beaver/ui-tokens"],
  reactStrictMode: true,
};

export default nextConfig;
