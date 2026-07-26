import { describe, expect, it } from "vitest";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import {
  attemptPlacement,
  commitObstacleDraft,
  INITIAL_PLACEMENT_SESSION,
  placementGhost,
  placementLandingCells,
  placementSessionReducer,
  type PlacementSession
} from "@/domain/placement-session";
import { DEFAULT_FREE_PLACEMENT_ROTATION } from "@/domain/free-placement";
import type { BuildArea } from "@/types";

const AREA: BuildArea = { width: 20, depth: 20, height: 8 };

function session(overrides: Partial<PlacementSession> = {}): PlacementSession {
  return { ...INITIAL_PLACEMENT_SESSION, ...overrides };
}

describe("placementSessionReducer", () => {
  it("abandons the previous tool's work in flight when a tool is armed", () => {
    const before = session({
      tool: "obstacle",
      obstacleDraft: { cornerA: [0, 0, 0] },
      freePlacementRotation: { horizontalSteps: 3, verticalSteps: 1 }
    });
    const after = placementSessionReducer(before, { type: "select-tool", tool: "tube" });
    expect(after.tool).toBe("tube");
    expect(after.obstacleDraft).toBeNull();
    expect(after.freePlacementRotation).toEqual(DEFAULT_FREE_PLACEMENT_ROTATION);
  });

  it("rotates the ghost for tools that snap to a port", () => {
    let s = session({ tool: "bend" });
    s = placementSessionReducer(s, { type: "rotate", reverse: false });
    expect(s.ghostRotation).toBe(1);
    // Shift-R steps backwards, and the index wraps within the four orientations.
    s = placementSessionReducer(s, { type: "rotate", reverse: true });
    expect(s.ghostRotation).toBe(0);
  });

  it("rotates the free-placement orientation instead for blower and terminal", () => {
    const s = placementSessionReducer(session({ tool: "blower" }), {
      type: "rotate",
      reverse: false
    });
    expect(s.ghostRotation).toBe(0);
    expect(s.freePlacementRotation).toEqual({ horizontalSteps: 1, verticalSteps: 0 });
  });

  it("keeps the elevation inside the build area", () => {
    const s = placementSessionReducer(session(), {
      type: "nudge-elevation",
      delta: -1,
      buildArea: AREA
    });
    // The ground plane is the floor; there is nothing below it to step onto.
    expect(s.activeElevation).toBe(0);
  });

  it("clamps the elevation and drops the draft when the build area shrinks", () => {
    const before = session({ activeElevation: 7, obstacleDraft: { cornerA: [0, 0, 0] } });
    const after = placementSessionReducer(before, {
      type: "constrain-to-build-area",
      buildArea: { width: 20, depth: 20, height: 3 }
    });
    expect(after.activeElevation).toBe(2);
    expect(after.obstacleDraft).toBeNull();
  });
});

describe("attemptPlacement", () => {
  it("ignores a click with the cursor tool", () => {
    const { result } = attemptPlacement(session(), emptyDesign(), [0, 0, 0], "p1");
    expect(result.status).toBe("ignored");
  });

  it("places a blower and remembers the orientation it used", () => {
    const { session: after, result } = attemptPlacement(
      session({ tool: "blower" }),
      emptyDesign(),
      [0, 0, 0],
      "pblower"
    );
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.design.parts.map((p) => p.id)).toEqual(["pblower"]);
    // The next blower starts from the orientation the last one was placed at.
    expect(after.freePlacementMemory.blower).toEqual(
      result.design.parts[0].type === "blower" ? result.design.parts[0].dir : null
    );
    expect(after.freePlacementRotation).toEqual(DEFAULT_FREE_PLACEMENT_ROTATION);
  });

  it("reports the reason a placement was refused instead of committing", () => {
    const { session: after, result } = attemptPlacement(
      session({ tool: "tube" }),
      emptyDesign(),
      [0, 0, 0],
      "ptube"
    );
    expect(result.status).toBe("error");
    expect(after).toEqual(session({ tool: "tube" }));
  });

  it("uses the id it is given rather than generating one", () => {
    const { result } = attemptPlacement(
      session({ tool: "blower" }),
      emptyDesign(),
      [1, 0, 1],
      "p-supplied"
    );
    expect(result.status === "committed" && result.design.parts[0].id).toBe("p-supplied");
  });

  it("keeps the live hover cell when a stale attempt is applied", () => {
    // `attemptPlacement` reads a session captured during render, so the pointer
    // can move on before the result is folded back in. Everything the click
    // decided should win, but where the pointer is now should not be reverted.
    const stale = session({ tool: "blower", hoverCell: [0, 0, 0] });
    const { session: attempted } = attemptPlacement(stale, emptyDesign(), [0, 0, 0], "pb");
    const live = session({ tool: "blower", hoverCell: [9, 0, 9] });

    const next = placementSessionReducer(live, { type: "apply-attempt", session: attempted });

    expect(next.hoverCell).toEqual([9, 0, 9]);
    expect(next.freePlacementMemory).toEqual(attempted.freePlacementMemory);
  });

  it("walks the obstacle draft through its two clicks without touching the design", () => {
    const design = emptyDesign();
    const first = attemptPlacement(session({ tool: "obstacle" }), design, [0, 0, 0], "o1");
    expect(first.result.status).toBe("updated");
    expect(first.session.obstacleDraft).not.toBeNull();

    const second = attemptPlacement(first.session, design, [2, 0, 2], "o1");
    expect(second.result.status).toBe("updated");
    expect(second.session.obstacleDraft?.cornerB).toEqual([2, 0, 2]);
  });
});

describe("commitObstacleDraft", () => {
  it("does nothing while the draft has no footprint yet", () => {
    const { result } = commitObstacleDraft(
      session({ tool: "obstacle", obstacleDraft: { cornerA: [0, 0, 0] } }),
      emptyDesign(),
      "o1"
    );
    expect(result.status).toBe("ignored");
  });

  it("places the volume and clears the draft", () => {
    const design = emptyDesign();
    const drafted = attemptPlacement(
      attemptPlacement(session({ tool: "obstacle" }), design, [0, 0, 0], "o1").session,
      design,
      [2, 0, 2],
      "o1"
    ).session;

    const { session: after, result } = commitObstacleDraft(drafted, design, "obox");
    expect(result.status).toBe("committed");
    expect(result.status === "committed" && result.design.obstacles.map((o) => o.id)).toEqual([
      "obox"
    ]);
    expect(after.obstacleDraft).toBeNull();
  });
});

describe("placementGhost", () => {
  it("has nothing to preview without a hovered cell", () => {
    expect(placementGhost(session({ tool: "blower" }), emptyDesign())).toBeNull();
  });

  it("has nothing to preview for the cursor and erase tools", () => {
    for (const tool of ["cursor", "erase"] as const) {
      expect(placementGhost(session({ tool, hoverCell: [0, 0, 0] }), emptyDesign())).toBeNull();
    }
  });

  it("previews the part the armed tool would place", () => {
    const ghost = placementGhost(session({ tool: "blower", hoverCell: [0, 0, 0] }), emptyDesign());
    expect(ghost?.type).toBe("blower");
  });
});

describe("placementLandingCells", () => {
  it("highlights nothing for tools that place freely", () => {
    expect(placementLandingCells(session({ tool: "blower" }), emptyDesign())).toEqual([]);
    expect(placementLandingCells(session({ tool: "cursor" }), emptyDesign())).toEqual([]);
  });

  it("highlights the blower outlet for Terminal 1", () => {
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
    expect(placementLandingCells(session({ tool: "terminal" }), design).length).toBeGreaterThan(0);
  });
});
