import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type ModalProps = {
  /** Accessible name for the dialog, announced when it opens. */
  label: string;
  onClose: () => void;
  /**
   * Whether clicking the backdrop dismisses. Off for dialogs holding
   * uncommitted form state, where a stray click would discard typing.
   */
  dismissOnBackdrop?: boolean;
  /** CSS width for the panel, e.g. `"min(420px, 92%)"`. */
  width: string;
  /** Extra panel styles, for the few dialogs that need to bound their height. */
  panelStyle?: CSSProperties;
  children: ReactNode;
};

const PANEL_BASE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--panel)",
  borderRadius: 10,
  border: "1px solid var(--line-2)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
  padding: 0,
  // `margin: auto` is what centres a modal <dialog> in the viewport — the UA
  // stylesheet sets it alongside `inset: 0`, and overriding it with `0` pins
  // the dialog to the top-left corner instead. Do not "tidy" this away.
  margin: "auto",
  // maxWidth is released so an explicit width like "min(820px, 92%)" applies;
  // maxHeight is deliberately left to the UA default, which keeps a tall
  // dialog on screen. The two dialogs that want more override it themselves.
  maxWidth: "none",
  color: "var(--text)",
  overflow: "hidden"
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
export function Modal({
  label,
  onClose,
  dismissOnBackdrop = true,
  width,
  panelStyle,
  children
}: ModalProps) {
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
      className="modal-dialog nosel"
      style={{ ...PANEL_BASE, width, ...panelStyle }}
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
