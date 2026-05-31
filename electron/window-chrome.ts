import type { BrowserWindowConstructorOptions } from "electron";

export const TITLEBAR_LEFT_INSET = 86;
export const WINDOWS_TITLEBAR_RIGHT_INSET = 148;
export const TITLEBAR_HEIGHT = 46;

export type WindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  "autoHideMenuBar" | "titleBarOverlay" | "titleBarStyle" | "trafficLightPosition"
> & {
  titleBarInset: number;
  titleBarRightInset: number;
};

export function windowChromeForPlatform(platform: NodeJS.Platform): WindowChromeOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 14 },
      titleBarInset: TITLEBAR_LEFT_INSET,
      titleBarRightInset: 0
    };
  }

  if (platform === "win32") {
    return {
      autoHideMenuBar: true,
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#181C25",
        symbolColor: "#E6E9EF",
        height: TITLEBAR_HEIGHT
      },
      titleBarInset: 0,
      titleBarRightInset: WINDOWS_TITLEBAR_RIGHT_INSET
    };
  }

  if (platform === "linux") {
    return {
      autoHideMenuBar: true,
      titleBarInset: 0,
      titleBarRightInset: 0
    };
  }

  return { titleBarInset: 0, titleBarRightInset: 0 };
}
