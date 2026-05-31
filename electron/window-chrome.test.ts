import { describe, expect, it } from "vitest";
import { windowChromeForPlatform } from "./window-chrome";

describe("Electron window chrome", () => {
  it("uses macOS hidden-inset chrome with native traffic light spacing", () => {
    expect(windowChromeForPlatform("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 14 },
      titleBarInset: 86,
      titleBarRightInset: 0
    });
  });

  it("uses hidden Windows chrome with a controls overlay", () => {
    expect(windowChromeForPlatform("win32")).toEqual({
      autoHideMenuBar: true,
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#181C25",
        symbolColor: "#E6E9EF",
        height: 46
      },
      titleBarInset: 0,
      titleBarRightInset: 148
    });
  });

  it("hides the native menu bar on Linux while keeping native chrome", () => {
    expect(windowChromeForPlatform("linux")).toEqual({
      autoHideMenuBar: true,
      titleBarInset: 0,
      titleBarRightInset: 0
    });
  });
});
