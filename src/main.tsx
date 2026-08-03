import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted: the app previously pulled Geist from Google Fonts at runtime,
// which meant a network round-trip on every launch and a silent fallback to
// system-ui when offline. `wght` is the upright variable axis; no italic files.
import "@fontsource-variable/geist/wght.css";
import App from "@/App";
import { electronPlatform } from "@/platform/electron";
import "@/styles/app.css";

// The desktop composition root. It chooses the host, and from PR 3 onward it is
// also where the commercial surfaces are assembled — so the Lite entry beside it
// can leave them out of its module graph entirely.
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App platform={electronPlatform()} />
  </StrictMode>
);
