import { describe, expect, it } from "vitest";
import { createCloseGate } from "./close-gate";

describe("createCloseGate", () => {
  it("asks the renderer before a close, then lets the approved close through", () => {
    const gate = createCloseGate();

    expect(gate.requestClose()).toBe("ask");
    gate.approve();
    expect(gate.requestClose()).toBe("close");
  });

  it("guards a replacement window, rather than inheriting the last one's approval", () => {
    const gate = createCloseGate();
    gate.requestClose();
    gate.approve();

    // macOS keeps the app running with no windows, and rebuilds one from the
    // dock. That window has its own unsaved work and must be asked about.
    gate.reset();

    expect(gate.requestClose()).toBe("ask");
  });

  it("reports that an approved close should also quit when a quit started it", () => {
    const gate = createCloseGate();
    gate.quitRequested();

    expect(gate.requestClose()).toBe("ask");
    expect(gate.approve()).toBe(true);
  });

  it("does not quit on a close the user started from the window itself", () => {
    const gate = createCloseGate();

    expect(gate.requestClose()).toBe("ask");
    expect(gate.approve()).toBe(false);
  });

  it("does not carry a declined quit over to the next close", () => {
    const gate = createCloseGate();
    gate.quitRequested();
    gate.requestClose(); // prompted, and the user cancelled — no approve()

    gate.requestClose(); // this time they used the window's own close button

    expect(gate.approve()).toBe(false);
  });
});
