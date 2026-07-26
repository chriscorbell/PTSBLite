import { useState } from "react";
import { Icons } from "@/components/Icons";

export type UpdateNotificationProps = {
  version: string;
  onDismiss: () => void;
};

// Non-blocking, on-brand replacement for the old native "update ready" dialog.
// Sits bottom-right above the status bar; dismissing is safe because the update
// still applies automatically the next time the app quits.
export function UpdateNotification({ version, onDismiss }: UpdateNotificationProps) {
  const [restarting, setRestarting] = useState(false);

  const restart = () => {
    setRestarting(true);
    void window.ptsbuilder?.quitAndInstall();
  };

  return (
    <div
      className="nosel"
      role="status"
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        zIndex: 90,
        width: 320,
        background: "var(--panel)",
        border: "1px solid var(--line-2)",
        borderRadius: 10,
        boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        animation: "updateToastIn .18s ease-out"
      }}
    >
      <style>{`
        @keyframes updateToastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 7,
            color: "var(--accent)",
            background: "var(--accent-bg)"
          }}
        >
          <Icons.Refresh size={15} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Update ready</div>
          <div style={{ fontSize: 12, color: "var(--text-mut)", marginTop: 2 }}>
            PTSBuilder {version} has been downloaded.
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss update notification"
          className="topbtn icon"
        >
          <Icons.Close size={14} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "0 14px 14px"
        }}
      >
        <button className="topbtn" onClick={onDismiss}>
          Later
        </button>
        <button
          className="topbtn"
          onClick={restart}
          disabled={restarting}
          style={{
            background: "var(--accent)",
            borderColor: "transparent",
            color: "#06121a",
            fontWeight: 600
          }}
        >
          {restarting ? "Restarting…" : "Restart now"}
        </button>
      </div>
    </div>
  );
}
