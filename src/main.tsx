import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted because the production CSP allows no network requests.
import "@fontsource-variable/geist/wght.css";
import App from "@/App";
import { webPlatform } from "@/platform/web";
import "@/styles/app.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App platform={webPlatform()} />
  </StrictMode>
);
