import { useState } from "react";
import { Icons } from "@/components/Icons";
import type { UpdateChannel } from "@/platform/types";
import "@/components/commercial/UpdateNotification.css";

export type UpdateNotificationProps = {
  version: string;
  updates: UpdateChannel;
  onDismiss: () => void;
};

// Non-blocking, on-brand replacement for the old native "update ready" dialog.
// Sits bottom-right above the status bar; dismissing is safe because the update
// still applies automatically the next time the app quits.
export function UpdateNotification({ version, updates, onDismiss }: UpdateNotificationProps) {
  const [restarting, setRestarting] = useState(false);

  const restart = () => {
    setRestarting(true);
    void updates.quitAndInstall();
  };

  return (
    <div className="update-toast nosel" role="status">
      <div className="update-toast__header">
        <span className="update-toast__icon">
          <Icons.Refresh size={15} />
        </span>
        <div className="update-toast__text">
          <div className="update-toast__title">Update ready</div>
          <div className="update-toast__detail">PTSBuilder {version} has been downloaded.</div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss update notification"
          className="topbtn icon"
        >
          <Icons.Close size={14} />
        </button>
      </div>

      <div className="update-toast__actions">
        <button className="topbtn" onClick={onDismiss}>
          Later
        </button>
        <button className="topbtn primary" onClick={restart} disabled={restarting}>
          {restarting ? "Restarting…" : "Restart now"}
        </button>
      </div>
    </div>
  );
}
