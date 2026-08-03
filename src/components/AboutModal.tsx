import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import type { UpdateChannel, UpdateCheckResult } from "@/platform/types";
import "@/components/AboutModal.css";

export type AboutModalProps = {
  productName: string;
  openExternal: (url: string) => void;
  /** `null` where the host cannot update itself, which hides the check. */
  updates: UpdateChannel | null;
  onClose: () => void;
};

// Injected at build time from package.json (see electron.vite.config.ts).
const GITHUB_URL = __GITHUB_URL__;
const VERSION = __APP_VERSION__;
const DESCRIPTION = __APP_DESCRIPTION__;

type UpdateState =
  { kind: "idle" } | { kind: "checking" } | { kind: "result"; result: UpdateCheckResult };

function updateMessageFor(result: UpdateCheckResult): string {
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

export function AboutModal({ productName, openExternal, updates, onClose }: AboutModalProps) {
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });

  const checkForUpdates = async () => {
    if (update.kind === "checking" || !updates) return;
    setUpdate({ kind: "checking" });
    const result = await updates.check();
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
    <Modal label={`About ${productName}`} onClose={onClose} size="sm">
      <>
        <div className="modal__header">
          <Icons.Info size={15} />
          <div className="modal__title">About</div>
          <div className="modal__spacer" />
          <button onClick={onClose} className="icon-btn" aria-label="Close about">
            <Icons.Close size={14} />
          </button>
        </div>

        <div className="about__body">
          <div>
            <div className="about__name">{productName}</div>
            <div className="about__description">{DESCRIPTION}</div>
          </div>

          <div className="about__version">
            <span>Version</span>
            <span className="about__version-number">{VERSION}</span>
          </div>

          <div className="about__links">
            <button className="topbtn" onClick={() => openExternal(GITHUB_URL)}>
              <Icons.Github size={14} /> View on GitHub
            </button>
            {/* Omitted rather than disabled where the host cannot update
                itself: in a browser a reload is the update, so an inert button
                would be describing a mechanism that does not exist. */}
            {updates && (
              <button
                className="topbtn"
                onClick={() => void checkForUpdates()}
                disabled={update.kind === "checking"}
              >
                <Icons.Refresh size={14} /> Check for updates
              </button>
            )}
          </div>

          {updateMessage && (
            <div className="about__update">
              <div className="about__update-message">{updateMessage}</div>
              {manualDownloadUrl && (
                <button
                  className="topbtn about__update-download"
                  onClick={() => openExternal(manualDownloadUrl)}
                >
                  <Icons.Github size={14} /> Download latest release
                </button>
              )}
            </div>
          )}
        </div>
      </>
    </Modal>
  );
}
