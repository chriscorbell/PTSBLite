import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted: the app previously pulled Geist from Google Fonts at runtime,
// which meant a network round-trip on every launch and a silent fallback to
// system-ui when offline. `wght` is the upright variable axis; no italic files.
import "@fontsource-variable/geist/wght.css";
import { electronPlatform } from "@/platform/electron";
import { DesktopProduct } from "@/products/desktop/DesktopProduct";
import "@/styles/app.css";

// PTSBuilder's entry point. Its counterpart is `main-lite.tsx`; the only modules
// the two share are the editor, so nothing commercial is reachable from there.
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <DesktopProduct platform={electronPlatform()} />
  </StrictMode>
);
