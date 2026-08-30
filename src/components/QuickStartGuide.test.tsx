import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuickStartGuide } from "@/components/QuickStartGuide";

/**
 * Two columns, and glyphs ahead of the text they belong to, are both things the
 * client asked for by hand after seeing the single-column box. Where the break
 * falls is his instruction rather than a consequence of the copy, so it is the
 * part worth holding still: adding a step to the end of the guide must not
 * quietly slide the split.
 *
 * How the columns *look* — side by side, both starting at the top of the box,
 * the icons in a gutter wide enough for the longest row — is a stylesheet
 * matter that happy-dom cannot see, and is checked in a browser instead.
 */
describe("QuickStartGuide", () => {
  it("breaks the steps into two columns after the tubing step", () => {
    render(<QuickStartGuide />);

    const columns = screen.getAllByRole("list");
    const steps = columns.map((column) =>
      Array.from(column.querySelectorAll("li"), (item) => item.textContent)
    );

    expect(steps[0]?.at(-1)).toBe("Place your tubing and bends");
    expect(steps[1]?.[0]).toBe("Complete your system by connecting terminal 2 and blower 2");
    expect(columns).toHaveLength(2);
  });

  it("numbers the second column on from the first, being one sequence", () => {
    render(<QuickStartGuide />);

    const [first, second] = screen.getAllByRole("list");

    expect(first?.getAttribute("start")).toBe("1");
    expect(second?.getAttribute("start")).toBe("4");
  });

  it("puts a step's icons before its text, as the controls legend does", () => {
    render(<QuickStartGuide />);

    const step = screen.getByText("Add obstacles with the obstacle tool").closest("li");

    expect(step?.firstElementChild?.className).toBe("quickstart__icons");
  });
});
