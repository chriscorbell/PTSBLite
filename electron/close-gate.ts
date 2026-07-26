/**
 * Decides whether a window may close outright or whether the renderer has to be
 * asked about unsaved work first, and remembers whether the close was part of a
 * quit.
 *
 * This was three loose booleans in main-process module scope, which is how both
 * of the bugs it replaces happened: the "renderer approved" flag was set once
 * and never cleared, so the *second* window in a process — macOS reopens one
 * from the dock, since `window-all-closed` deliberately does not quit there —
 * closed without anyone being asked about unsaved work. And vetoing a close
 * also cancels the `app.quit()` that caused it, so a confirmed `Cmd`+`Q` closed
 * the window and left the app running with nothing on screen.
 *
 * Both are invisible to the type checker and neither is reachable from a test
 * that cannot drive a real BrowserWindow, so the state lives here instead.
 */
export interface CloseGate {
  /** The app is quitting; the window close that follows belongs to it. */
  quitRequested(): void;
  /**
   * A window close event arrived. `"close"` means the renderer already
   * approved this one; `"ask"` means veto it and ask.
   *
   * Consumes any pending quit request, so declining the prompt cannot leave it
   * armed for a later, unrelated close.
   */
  requestClose(): "close" | "ask";
  /** The renderer approved the close. Returns whether the app should also quit. */
  approve(): boolean;
  /** A newly created window starts guarded again. */
  reset(): void;
}

export function createCloseGate(): CloseGate {
  let approved = false;
  let quitPending = false;
  let closeIsQuit = false;

  return {
    quitRequested() {
      quitPending = true;
    },

    requestClose() {
      if (approved) return "close";
      closeIsQuit = quitPending;
      quitPending = false;
      return "ask";
    },

    approve() {
      approved = true;
      return closeIsQuit;
    },

    reset() {
      approved = false;
      quitPending = false;
      closeIsQuit = false;
    }
  };
}
