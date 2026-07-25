import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `globals: false`, so Testing Library's automatic cleanup never registers
// itself. Unmount between tests explicitly, or App's window-level keydown
// listeners accumulate across tests and every keyboard assertion fires N times.
afterEach(() => {
  cleanup();
});
