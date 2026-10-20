import type { MetadataRoute } from "next";

// Installable app (Add to Home Screen / Install app). Icons: public/icons, made from the ProductLogik logo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProductLogik POS",
    short_name: "ProductLogik",
    description: "Inventory, invoicing, statements and billing.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
