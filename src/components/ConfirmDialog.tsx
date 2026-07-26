import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import "@/components/ConfirmDialog.css";

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
        <div className="modal__header">
          <span className={`confirm-dialog__icon${danger ? " confirm-dialog__icon--danger" : ""}`}>
            <Icons.Warn size={15} />
          </span>
          <div className="modal__title">{title}</div>
          <div className="modal__spacer" />
          <button onClick={onCancel} className="icon-btn" aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>

        <div className="confirm-dialog__message">{message}</div>

        <div className="modal__actions">
          <button className="topbtn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`topbtn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </>
    </Modal>
  );
}
