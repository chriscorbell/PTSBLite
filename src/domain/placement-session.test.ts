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
      freePlacementRotation: 3
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
    expect(s.freePlacementRotation).toBe(1);

    // Shift-R is simply the other way round the same ring.
    const back = placementSessionReducer(session({ tool: "blower" }), {
      type: "rotate",
      reverse: true
    });
    expect(back.freePlacementRotation).toBe(-1);
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

  it("drags the hover cell along when the elevation moves", () => {
    // The ghost derives from the hover cell, so this is what makes an elevation
    // key visibly do something before the pointer moves again.
    const before = session({ tool: "blower", hoverCell: [3, 0, 4] });
    const s = placementSessionReducer(before, {
      type: "nudge-elevation",
      delta: 2,
      buildArea: AREA
    });
    expect(s.activeElevation).toBe(2);
    expect(s.hoverCell).toEqual([3, 2, 4]);
  });

  it("jumps the elevation with set-elevation, clamped to the build area", () => {
    const before = session({ hoverCell: [1, 0, 1] });
    const jumped = placementSessionReducer(before, {
      type: "set-elevation",
      elevation: 5,
      buildArea: AREA
    });
    expect(jumped.activeElevation).toBe(5);
    expect(jumped.hoverCell).toEqual([1, 5, 1]);

    const clamped = placementSessionReducer(before, {
      type: "set-elevation",
      elevation: 99,
      buildArea: AREA
    });
    expect(clamped.activeElevation).toBe(AREA.height - 1);
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

  it("places a terminal with no blower down, and away from the one that is", () => {
    // Both used to be refused: Terminal 1 was pinned to the blower's outlet
    // cell and could not be placed before a blower existed. The client withdrew
    // that rule — tubing between blower 1 and Terminal 1 is "remoting the
    // blower", a real installation. See ADR-0019.
    const first = attemptPlacement(session({ tool: "terminal" }), emptyDesign(), [0, 0, 0], "t1");
    expect(first.result.status).toBe("committed");
    if (first.result.status !== "committed") return;

    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
    const remoted = attemptPlacement(session({ tool: "terminal" }), design, [6, 0, 0], "t1");
    expect(remoted.result.status).toBe("committed");
    if (remoted.result.status !== "committed") return;
    expect(remoted.result.design.parts.at(-1)).toMatchObject({ id: "t1", cell: [6, 0, 0] });
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
  it("highlights nothing until there is an open port to snap to", () => {
    expect(placementLandingCells(session({ tool: "blower" }), emptyDesign())).toEqual([]);
    expect(placementLandingCells(session({ tool: "terminal" }), emptyDesign())).toEqual([]);
    expect(placementLandingCells(session({ tool: "cursor" }), emptyDesign())).toEqual([]);
  });

  it("highlights a blower's outlet for both endpoint tools", () => {
    // Blower 2 lands on an open port the same way a terminal does, so both
    // tools light up the same cells. See ADR-0019.
    const design = designFromScene({
      parts: [{ id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] }],
      obstacles: []
    });
    expect(placementLandingCells(session({ tool: "terminal" }), design)).toEqual([[1, 0, 0]]);
    expect(placementLandingCells(session({ tool: "blower" }), design)).toEqual([[1, 0, 0]]);
  });

  it("follows the cursor for the obstacle tool", () => {
    const s = session({ tool: "obstacle", hoverCell: [3, 0, -4] });
    expect(placementLandingCells(s, emptyDesign())).toEqual([[3, 0, -4]]);
    // Mid-draft too: the moving corner is the cell the next click takes.
    expect(
      placementLandingCells({ ...s, obstacleDraft: { cornerA: [0, 0, 0] } }, emptyDesign())
    ).toEqual([[3, 0, -4]]);
  });

  it("puts the obstacle highlight on the floor, not on the raised plane", () => {
    // The volume is drawn on the floor of the storey being worked on, so the
    // square showing where it will land belongs there too.
    const s = session({ tool: "obstacle", hoverCell: [3, 6, -4] });
    expect(placementLandingCells(s, emptyDesign())).toEqual([[3, 0, -4]]);

    // Two floors: above the slab the highlight sits on the upper floor's floor.
    const upstairs = emptyDesign({ multiFloor: true, room: { width: 60, depth: 40, height: 12 } });
    expect(
      placementLandingCells(session({ tool: "obstacle", hoverCell: [3, 20, -4] }), upstairs)
    ).toEqual([[3, 13, -4]]);
  });

  it("highlights nothing for the obstacle tool off the grid", () => {
    // The hover plane runs well past the build area, and a highlight out there
    // would offer a corner `startObstaclePlacement` refuses.
    expect(placementLandingCells(session({ tool: "obstacle" }), emptyDesign())).toEqual([]);
    expect(
      placementLandingCells(session({ tool: "obstacle", hoverCell: [900, 0, 0] }), emptyDesign())
    ).toEqual([]);
  });
});
