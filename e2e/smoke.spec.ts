import { expect, test, type Page } from "@playwright/test";

/**
 * The real-browser smoke suite: the few behaviours CI could not otherwise see.
 * happy-dom has no WebGL, no downloads, and no meaningful storage, so the unit
 * suites prove the logic while this proves the assembled production build
 * actually boots, renders, places through the raycaster, autosaves, and
 * exports. Anything more belongs in a domain or component test, not here.
 *
 * Deliberately no screenshot or pixel assertions: these tests prove the app
 * *runs*, not that it looks right — a shader change rendering everything
 * magenta still passes. Visual regression testing was considered and rejected
 * as too flaky for a project this size; looking right stays a human check
 * (see CLAUDE.md's note on checking the production build by hand).
 */

/** Uncaught page errors collected from `page`; asserted empty at the end. */
function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  return errors;
}

/** Answer the welcome screen's setup form with its defaults. */
async function createDesign(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create design" }).click();
}

/** The status bar's PARTS readout, which counts the placed parts. */
function partsCount(page: Page) {
  return page.locator(".status-bar__meta", { hasText: "PARTS" }).locator(".status-bar__meta-value");
}

/** Arm the blower tool and click the viewport's centre to place one. */
async function placeBlower(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Blower Unit", exact: true }).click();
  // The click raycasts against the real scene: it only places a part if the
  // WebGL canvas, the camera, and the picking maths all actually work.
  await page.locator(".viewport-canvas canvas").click();
  await expect(partsCount(page)).toHaveText("1");
}

test("boots, renders the viewport, and places a part", async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto("/");
  await expect(page.getByText("Welcome to PTSBLite")).toBeVisible();
  await page.getByRole("button", { name: "Create design" }).click();

  await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
  await expect(partsCount(page)).toHaveText("0");
  await placeBlower(page);

  expect(errors).toEqual([]);
});

test("autosaves to real storage and restores after a reload", async ({ page }) => {
  await createDesign(page);
  await placeBlower(page);

  // Reload immediately: the pagehide flush, not the debounce, must cover this.
  await page.reload();
  await expect(page.getByText("Welcome back")).toBeVisible();
  await page.getByRole("button", { name: "Continue design" }).click();
  await expect(partsCount(page)).toHaveText("1");
});

test("exports the BOM PDF through the real download path", async ({ page }) => {
  const errors = collectPageErrors(page);

  await createDesign(page);
  await placeBlower(page);

  await page.getByRole("button", { name: "Finalize" }).click();
  const downloadPromise = page.waitForEvent("download");
  // Exercises the WebGL view capture, pdf-lib, and the object-URL download.
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("BOM.pdf");

  expect(errors).toEqual([]);
});
