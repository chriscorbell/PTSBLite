import { useEffect, useRef, type ReactNode } from "react";
import "@/components/Modal.css";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export type ModalProps = {
  /** Accessible name for the dialog, announced when it opens. */
  label: string;
  onClose: () => void;
  /**
   * Whether clicking the backdrop dismisses. Off for dialogs holding
   * uncommitted form state, where a stray click would discard typing.
   */
  dismissOnBackdrop?: boolean;
  /**
   * How wide the panel is. A named size rather than a CSS length: the
   * dimensions belong with the dialog's own stylesheet, not threaded in as a
   * string (ADR-0009).
   */
  size: ModalSize;
  children: ReactNode;
};

/**
 * The shell every modal dialog sits in.
 *
 * Built on the native `<dialog>` rather than a hand-rolled overlay, because
 * `showModal()` supplies for free the four things all four dialogs were missing
 * (issue #23): `role="dialog"` semantics, focus moved into the dialog, focus
 * contained while it is open, and focus restored to whatever was focused before
 * when it closes. Escape is native too, delivered as a `cancel` event.
 *
 * The previous hand-rolled version was four copies of the same absolutely
 * positioned overlay, none of which did any of that.
 */
export function Modal({ label, onClose, dismissOnBackdrop = true, size, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`modal-dialog modal-dialog--${size} nosel`}
      onCancel={(event) => {
        // Escape. Prevented so the browser does not also close the dialog out
        // from under React, which would leave the parent still rendering it.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop reports the dialog itself as the target;
        // clicks on the content report a descendant.
        if (dismissOnBackdrop && event.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
