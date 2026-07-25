import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted: the app previously pulled Geist from Google Fonts at runtime,
// which meant a network round-trip on every launch and a silent fallback to
// system-ui when offline. `wght` is the upright variable axis; no italic files.
import "@fontsource-variable/geist/wght.css";
import App from "@/App";
import "@/styles/app.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
