import type { CSSProperties } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

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

// In-app confirmation modal — an on-brand replacement for window.confirm.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Modal label={title} onClose={onCancel} size="sm">
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)"
          }}
        >
          <span style={{ color: danger ? "var(--danger)" : "var(--text-mut)", display: "flex" }}>
            <Icons.Warn size={15} />
          </span>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} style={iconBtn} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>

        <div
          style={{
            padding: "18px 18px 4px",
            fontSize: 13,
            color: "var(--text-mut)",
            lineHeight: 1.5
          }}
        >
          {message}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "16px 18px"
          }}
        >
          <button className="topbtn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="topbtn"
            onClick={onConfirm}
            autoFocus
            style={
              danger
                ? {
                    background: "var(--danger)",
                    borderColor: "transparent",
                    color: "#0b0e13",
                    fontWeight: 600
                  }
                : {
                    background: "var(--accent)",
                    borderColor: "transparent",
                    color: "#06121a",
                    fontWeight: 600
                  }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </>
    </Modal>
  );
}
