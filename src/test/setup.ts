import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Text queries skip anything hidden from assistive technology, alongside the
// `script, style` this replaces.
//
// Decorative content that repeats a control's accessible name — the left rail's
// tooltips, for instance — is now always in the DOM and revealed with CSS
// (ADR-0009), rather than being mounted on hover. `getByText` would otherwise
// match the rail's silent copy of a label as readily as the visible readout,
// which is a duplicate the user never experiences.
// The descendant selector is load-bearing: `ignore` is matched against the
// candidate element itself, not its ancestors, so hiding a wrapper does not hide
// the node the text actually sits on.
configure({
  defaultIgnore: "script, style, [aria-hidden='true'], [aria-hidden='true'] *"
});

// `globals: false`, so Testing Library's automatic cleanup never registers
// itself. Unmount between tests explicitly, or App's window-level keydown
// listeners accumulate across tests and every keyboard assertion fires N times.
afterEach(() => {
  cleanup();
});
