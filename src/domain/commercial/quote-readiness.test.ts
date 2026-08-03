import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings } from "@/domain/app-settings";
import { emptyDesign } from "@/domain/design-state";
import { quoteReadiness, quoteSubtotal } from "@/domain/commercial/quote-readiness";
import type { DesignState, Part } from "@/types";

const READY_SETTINGS: AppSettings = {
  pricing: { blower: 4250, terminal: 1850, tube6: 78, bend90: 142 },
  taxRate: 0.0825,
  company: {
    name: "Tube Co",
    tagline: "Pneumatic Tube Systems",
    address: "1 Example Way",
    phone: "(555) 111-2222",
    email: "sales@tube.example"
  },
  quote: {
    billTo: { name: "Acme Hospital", lines: ["Attn: Facilities"] },
    project: { name: "West Wing", lines: [] },
    quoteNumber: "Q-1001",
    notes: "Installation quoted separately."
  }
};

const PARTS: Part[] = [
  { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] }
];

function design(): DesignState {
  return { ...emptyDesign(), parts: PARTS };
}

function labels(settings: AppSettings): string[] {
  const readiness = quoteReadiness(design(), settings);
  return readiness.ready ? [] : readiness.blockers.map((b) => b.label);
}

describe("quoteReadiness", () => {
  it("is ready when every customer-visible value has been entered", () => {
    const readiness = quoteReadiness(design(), READY_SETTINGS);
    expect(readiness.ready).toBe(true);
    if (!readiness.ready) return;
    expect(readiness.quote.taxRate).toBe(0.0825);
    expect(readiness.quote.company.name).toBe("Tube Co");
    expect(readiness.quote.rows).toHaveLength(4);
  });

  it("blocks a freshly installed app, and names everything missing at once", () => {
    // The whole list, not the first failure: an installer setting the app up
    // should see the work in one go rather than one field at a time.
    const blockers = labels(DEFAULT_SETTINGS);
    expect(blockers).toContain("Company name");
    expect(blockers).toContain("Company address");
    expect(blockers).toContain("Customer name");
    expect(blockers).toContain("Quote number");
    expect(blockers).toContain("Quote notes");
    expect(blockers).toContain("Tax rate");
    expect(blockers.filter((l) => l.startsWith("Price for"))).toHaveLength(4);
  });

  it("blocks on a missing tax rate even when everything else is set", () => {
    // The most dangerous omission: unlike a blank company name, a wrong tax
    // rate reads as authoritative on a typeset quote.
    expect(labels({ ...READY_SETTINGS, taxRate: null })).toEqual(["Tax rate"]);
  });

  it("treats a zero tax rate as entered", () => {
    const readiness = quoteReadiness(design(), { ...READY_SETTINGS, taxRate: 0 });
    expect(readiness.ready).toBe(true);
  });

  it("blocks on a part with no price, naming the part", () => {
    const { bend90: _dropped, ...pricing } = READY_SETTINGS.pricing;
    expect(labels({ ...READY_SETTINGS, pricing })).toEqual(["Price for 90° Bend (3ft radius)"]);
  });

  it("treats whitespace-only text as unentered", () => {
    const settings = {
      ...READY_SETTINGS,
      company: { ...READY_SETTINGS.company, name: "   " }
    };
    expect(labels(settings)).toEqual(["Company name"]);
  });

  it("blocks on an empty customer address", () => {
    const settings = {
      ...READY_SETTINGS,
      quote: { ...READY_SETTINGS.quote, billTo: { name: "Acme", lines: [] } }
    };
    expect(labels(settings)).toEqual(["Customer address"]);
  });

  it("points each blocker at the settings screen that fixes it", () => {
    const readiness = quoteReadiness(design(), DEFAULT_SETTINGS);
    if (readiness.ready) throw new Error("expected blockers");
    const tabFor = (label: string) => readiness.blockers.find((b) => b.label === label)?.tab;
    expect(tabFor("Company name")).toBe("company");
    expect(tabFor("Quote number")).toBe("quote");
    expect(tabFor("Tax rate")).toBe("pricing");
  });
});

describe("quoteSubtotal", () => {
  it("sums quantity times unit price", () => {
    const readiness = quoteReadiness(design(), READY_SETTINGS);
    if (!readiness.ready) throw new Error("expected a ready quote");
    // One blower, one terminal, no tube or bends.
    expect(quoteSubtotal(readiness.quote.rows)).toBe(4250 + 1850);
  });
});
