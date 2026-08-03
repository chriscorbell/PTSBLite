import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted rather than fetched: the CSP this ships under allows no network
// requests at all, and a public page should not wait on a font CDN.
import "@fontsource-variable/geist/wght.css";
import { webPlatform } from "@/platform/web";
import { LiteProduct } from "@/products/lite/LiteProduct";
import "@/styles/app.css";

// PTSBuilderLite's entry point. Nothing reachable from here imports
// `commercial/`, which is what the build check in vite.config.ts enforces.
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LiteProduct platform={webPlatform()} />
  </StrictMode>
);
