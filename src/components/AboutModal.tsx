import { useState, type CSSProperties } from "react";
import { Icons } from "@/components/Icons";
import { useEscapeKey } from "@/components/useEscapeKey";
import type { CheckForUpdatesResult } from "@/global";

export type AboutModalProps = {
  onClose: () => void;
};

// Injected at build time from package.json (see electron.vite.config.ts).
const GITHUB_URL = __GITHUB_URL__;
const VERSION = __APP_VERSION__;
const DESCRIPTION = __APP_DESCRIPTION__;

const iconBtn: CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--text-mut)",
  background: "transparent",
  border: "1px solid transparent",
  cursor: "pointer"
};

type UpdateState =
  { kind: "idle" } | { kind: "checking" } | { kind: "result"; result: CheckForUpdatesResult };

function updateMessageFor(result: CheckForUpdatesResult): string {
  switch (result.status) {
    case "available":
      return `Version ${result.version} is available and is downloading in the background.`;
    case "manual":
      return `Version ${result.version} is available — download it from GitHub to update.`;
    case "up-to-date":
      return "You're on the latest version.";
    case "error":
      return "Couldn't check for updates. Try again later.";
  }
}

export function AboutModal({ onClose }: AboutModalProps) {
  useEscapeKey(onClose);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });

  // Route links through the main process so they open in the system browser
  // rather than navigating the renderer window.
  const openExternal = (url: string) => {
    void window.ptsbuilder?.openExternal(url);
  };

  const checkForUpdates = async () => {
    if (update.kind === "checking" || !window.ptsbuilder) return;
    setUpdate({ kind: "checking" });
    const result = await window.ptsbuilder.checkForUpdates();
    setUpdate({ kind: "result", result });
  };

  const updateMessage =
    update.kind === "checking"
      ? "Checking for updates…"
      : update.kind === "result"
        ? updateMessageFor(update.result)
        : null;
  const manualDownloadUrl =
    update.kind === "result" && update.result.status === "manual" ? update.result.url : null;

  return (
    <div
      className="nosel"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5,7,10,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92%)",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          borderRadius: 10,
          border: "1px solid var(--line-2)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)"
          }}
        >
          <Icons.Info size={15} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>About</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={iconBtn} aria-label="Close about">
            <Icons.Close size={14} />
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>PTSBuilder</div>
            <div style={{ fontSize: 13, color: "var(--text-mut)", marginTop: 4 }}>
              {DESCRIPTION}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-mut)"
            }}
          >
            <span>Version</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--line-2)",
                background: "var(--panel-2)",
                color: "var(--text)"
              }}
            >
              {VERSION}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="topbtn" onClick={() => openExternal(GITHUB_URL)}>
              <Icons.Github size={14} /> View on GitHub
            </button>
            <button
              className="topbtn"
              onClick={() => void checkForUpdates()}
              disabled={update.kind === "checking"}
            >
              <Icons.Refresh size={14} /> Check for updates
            </button>
          </div>

          {updateMessage && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: -4 }}>
              <div style={{ fontSize: 12, color: "var(--text-mut)" }}>{updateMessage}</div>
              {manualDownloadUrl && (
                <button
                  className="topbtn"
                  onClick={() => openExternal(manualDownloadUrl)}
                  style={{ alignSelf: "flex-start" }}
                >
                  <Icons.Github size={14} /> Download latest release
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
