import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PDF fonts read from disk at render time (src/lib/pdf.tsx); PDFs are made by API routes and server actions.
  outputFileTracingIncludes: {
    "/*": ["src/assets/fonts/*.ttf"],
  },
  experimental: {
    // Subscription payment screenshots (up to 5 MB) are sent through server actions (default 1 MB).
    serverActions: { bodySizeLimit: "6mb" },
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
