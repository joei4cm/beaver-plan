import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@beaver/core",
    "@beaver/i18n",
    "@beaver/ui-tokens",
    "@beaver/offline",
  ],
  reactStrictMode: true,
  // packages/core uses TypeScript ESM `.js` import specifiers → `.ts` sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
