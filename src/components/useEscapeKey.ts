import { useEffect } from "react";

/**
 * Invoke `onEscape` whenever the user presses Escape while the component is
 * mounted. Used by modals to close on Esc. Registered on `document` in the
 * capture phase so it fires regardless of where focus currently sits.
 */
export function useEscapeKey(onEscape: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture-phase + stopPropagation so closing a modal doesn't also reach the
      // app's global Escape handler (which would reset the active tool).
      event.stopPropagation();
      onEscape();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onEscape]);
}
