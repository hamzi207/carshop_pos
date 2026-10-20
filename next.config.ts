import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PDF fonts read from disk at render time (src/lib/pdf.tsx); PDFs are made by API routes and server actions.
  outputFileTracingIncludes: {
    "/*": ["src/assets/fonts/*.ttf"],
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
