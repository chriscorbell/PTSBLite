import { bendLandingCells, bendPlacementGhost, placeBend } from "@/domain/bend-placement";
import { eraseAtCell } from "@/domain/erase-placement";
import {
  DEFAULT_FREE_PLACEMENT_MEMORY,
  DEFAULT_FREE_PLACEMENT_ROTATION,
  freePlacementGhost,
  freePlacementLandingCells,
  placeFreePart,
  rememberFreePlacementOrientation,
  type FreePlacementMemory,
  type FreePlacementRotation,
  type FreePlacementType
} from "@/domain/free-placement";
import {
  cancelObstaclePlacement,
  moveObstaclePlacementBase,
  obstaclePlacementDraftBounds,
  obstaclePlacementDraftHasFootprint,
  obstaclePlacementGhost,
  placeObstacleVolume,
  resizeObstaclePlacementHeight,
  setObstaclePlacementFootprint,
  startObstaclePlacement,
  type ObstacleKind,
  type ObstaclePlacementDraft
} from "@/domain/obstacle-placement";
import { clampElevation } from "@/domain/sparse-grid";
import { placeTube, tubeLandingCells, tubePlacementGhost } from "@/domain/tube-placement";
import type { BuildArea, DesignState, Ghost, ToolId, Vec3 } from "@/types";

/**
 * Everything about a placement in progress: which tool is armed, where the
 * pointer is, how the ghost is turned, what the obstacle drag has drawn so far,
 * and which plane placement lands on.
 *
 * These seven were seven separate `useState` calls in `App`, and they are not
 * independent: arming a tool abandons whatever the last one had in flight, and
 * shrinking the build area both clamps the elevation and drops the draft. Rules
 * like that belong somewhere they can be stated once and tested without a
 * renderer.
 *
 * Nothing here touches React, the DOM, or the file system, and nothing here
 * generates an id — `attemptPlacement` takes one, so it stays a function of its
 * arguments. See `newOccupantId`.
 */
export type PlacementSession = {
  tool: ToolId;
  hoverCell: Vec3 | null;
  obstacleDraft: ObstaclePlacementDraft | null;
  /** Which kind of volume the obstacle tool draws. Sticky across tool changes. */
  obstacleKind: ObstacleKind;
  ghostRotation: number;
  freePlacementMemory: FreePlacementMemory;
  freePlacementRotation: FreePlacementRotation;
  activeElevation: number;
};

export const INITIAL_PLACEMENT_SESSION: PlacementSession = {
  tool: "cursor",
  hoverCell: null,
  obstacleDraft: null,
  obstacleKind: "impenetrable",
  ghostRotation: 0,
  freePlacementMemory: DEFAULT_FREE_PLACEMENT_MEMORY,
  freePlacementRotation: DEFAULT_FREE_PLACEMENT_ROTATION,
  activeElevation: 0
};

export type PlacementAction =
  /** Arm a tool. Abandons anything the previous tool had in flight. */
  | { type: "select-tool"; tool: ToolId }
  | { type: "hover"; cell: Vec3 | null }
  /** `R` (or shift-`R`) — turns the ghost, or the free-placement orientation. */
  | { type: "rotate"; reverse: boolean }
  /** `[` and `]` — move the active placement plane. */
  | { type: "nudge-elevation"; delta: number; buildArea: BuildArea }
  /** Jump the placement plane, e.g. the floor selector picking a floor's base. */
  | { type: "set-elevation"; elevation: number; buildArea: BuildArea }
  /** The build area changed: re-derive what no longer fits inside it. */
  | { type: "set-obstacle-base"; baseY: number; buildArea: BuildArea }
  | { type: "set-obstacle-height"; height: number; buildArea: BuildArea }
  | { type: "cancel-obstacle-draft" }
  /** Switch what the obstacle tool draws. An in-flight draft keeps its shape. */
  | { type: "set-obstacle-kind"; kind: ObstacleKind }
  /**
   * Fold back the session `attemptPlacement` or `commitObstacleDraft` returned.
   *
   * Those two need the current design to reach the placement rules and have to
   * report a result as well as a next state, which is more than a reducer can
   * return — so they stay pure functions and this action carries their answer
   * back in.
   */
  | { type: "apply-attempt"; session: PlacementSession };

function isFreePlacementTool(tool: ToolId): tool is FreePlacementType {
  return tool === "blower" || tool === "terminal";
}

/**
 * Move the placement plane, dragging the hover cell — and the ghost derived
 * from it — along. Without this, pressing an elevation key changed nothing on
 * screen until the pointer happened to move again, which read as the key doing
 * nothing at all.
 */
function withElevation(session: PlacementSession, activeElevation: number): PlacementSession {
  return {
    ...session,
    activeElevation,
    hoverCell: session.hoverCell
      ? [session.hoverCell[0], activeElevation, session.hoverCell[2]]
      : session.hoverCell
  };
}

export function placementSessionReducer(
  session: PlacementSession,
  action: PlacementAction
): PlacementSession {
  switch (action.type) {
    case "select-tool":
      return {
        ...session,
        tool: action.tool,
        freePlacementRotation: DEFAULT_FREE_PLACEMENT_ROTATION,
        obstacleDraft: null
      };

    case "hover":
      return { ...session, hoverCell: action.cell };

    case "rotate":
      if (isFreePlacementTool(session.tool)) {
        // One ring of five orientations, so shift-R is simply the other way
        // round it. It used to toggle up/down on a separate axis, which left a
        // blower that had been turned sideways unable to point back up.
        return {
          ...session,
          freePlacementRotation: session.freePlacementRotation + (action.reverse ? -1 : 1)
        };
      }
      return {
        ...session,
        ghostRotation: (session.ghostRotation + (action.reverse ? 3 : 1)) % 4
      };

    case "nudge-elevation":
      return withElevation(
        session,
        clampElevation(session.activeElevation + action.delta, action.buildArea)
      );

    case "set-elevation":
      return withElevation(session, clampElevation(action.elevation, action.buildArea));

    case "set-obstacle-base":
      return {
        ...session,
        obstacleDraft: session.obstacleDraft
          ? moveObstaclePlacementBase(session.obstacleDraft, action.baseY, action.buildArea)
          : session.obstacleDraft
      };

    case "set-obstacle-height":
      return {
        ...session,
        obstacleDraft: session.obstacleDraft
          ? resizeObstaclePlacementHeight(session.obstacleDraft, action.height, action.buildArea)
          : session.obstacleDraft
      };

    case "set-obstacle-kind":
      return { ...session, obstacleKind: action.kind };

    case "cancel-obstacle-draft":
      return { ...session, obstacleDraft: cancelObstaclePlacement(session.obstacleDraft) };

    case "apply-attempt":
      // The attempt was computed from a session read during render, so it can be
      // a pointer-move behind by the time it is applied. Everything else in it
      // is a consequence of the click and should win, but where the pointer is
      // now is not something a placement gets a say in — keeping the live hover
      // cell stops a click from dragging the ghost back to where the pointer
      // used to be.
      return { ...action.session, hoverCell: session.hoverCell };
  }
}

/** What a click on the grid did. */
export type PlacementResult =
  /** Nothing to do — the cursor tool, or an orientation that could not be resolved. */
  | { status: "ignored" }
  /** The session moved on but the design did not, i.e. the obstacle drag advanced. */
  | { status: "updated" }
  | { status: "error"; message: string }
  | { status: "committed"; design: DesignState };

/**
 * Apply a click at `cell` with whatever tool is armed.
 *
 * The tool branches stay explicit rather than collapsing into a lookup table:
 * they take genuinely different arguments — a source part, a rotation index, an
 * orientation memory — and a table would hide that behind optional fields and
 * casts.
 *
 * `occupantId` is supplied by the caller because generating one would make this
 * depend on `crypto`, and the point of putting the placement rules here is that
 * they can be tested by reading the return value.
 */
export function attemptPlacement(
  session: PlacementSession,
  design: DesignState,
  cell: Vec3,
  occupantId: string,
  sourcePartId?: string
): { session: PlacementSession; result: PlacementResult } {
  const unchanged = (result: PlacementResult) => ({ session, result });

  switch (session.tool) {
    case "cursor":
      return unchanged({ status: "ignored" });

    case "erase": {
      const erased = eraseAtCell(design, cell);
      return unchanged(
        erased.ok
          ? { status: "committed", design: erased.design }
          : { status: "error", message: erased.message }
      );
    }

    // Blowers and terminals place identically: anywhere legal, snapping to an
    // open port when there is one under the cursor. Terminal 1 used to be a
    // third case, pinned to the blower's outlet cell, until the client withdrew
    // that rule (ADR-0019).
    case "blower":
    case "terminal": {
      // The ghost resolves the orientation, so what gets placed is what was
      // previewed rather than a second, independently derived answer.
      const type: FreePlacementType = session.tool;
      const preview = freePlacementGhost({
        type,
        design,
        cell,
        memory: session.freePlacementMemory,
        rotationSteps: session.freePlacementRotation
      });
      const orientation = preview
        ? preview.type === "blower"
          ? preview.dir
          : preview.axis
        : session.freePlacementMemory[type];
      const placed = placeFreePart(design, { id: occupantId, type, cell, orientation });
      if (!placed.ok) return unchanged({ status: "error", message: placed.message });
      return {
        session: {
          ...session,
          freePlacementMemory: rememberFreePlacementOrientation(
            session.freePlacementMemory,
            type,
            orientation
          ),
          freePlacementRotation: DEFAULT_FREE_PLACEMENT_ROTATION
        },
        result: { status: "committed", design: placed.design }
      };
    }

    case "tube": {
      const placed = placeTube(design, { id: occupantId, cell, sourcePartId });
      return unchanged(
        placed.ok
          ? { status: "committed", design: placed.design }
          : { status: "error", message: placed.message }
      );
    }

    case "bend": {
      const placed = placeBend(design, {
        id: occupantId,
        cell,
        sourcePartId,
        rotationIndex: session.ghostRotation
      });
      return unchanged(
        placed.ok
          ? { status: "committed", design: placed.design }
          : { status: "error", message: placed.message }
      );
    }

    case "obstacle": {
      // Two clicks: the first anchors a corner, the second sets the footprint.
      // Height is then adjusted from the HUD before `commitObstacleDraft`.
      if (!session.obstacleDraft) {
        const started = startObstaclePlacement(design, cell, session.obstacleKind);
        if (!started.ok) return unchanged({ status: "error", message: started.message });
        return {
          session: { ...session, obstacleDraft: started.draft },
          result: { status: "updated" }
        };
      }
      if (!obstaclePlacementDraftHasFootprint(session.obstacleDraft)) {
        return {
          session: {
            ...session,
            obstacleDraft: setObstaclePlacementFootprint(session.obstacleDraft, cell)
          },
          result: { status: "updated" }
        };
      }
      return unchanged({ status: "ignored" });
    }
  }
}

/** Turn a finished obstacle draft into a placed volume. */
export function commitObstacleDraft(
  session: PlacementSession,
  design: DesignState,
  occupantId: string
): { session: PlacementSession; result: PlacementResult } {
  if (!obstaclePlacementDraftHasFootprint(session.obstacleDraft)) {
    return { session, result: { status: "ignored" } };
  }
  const bounds = obstaclePlacementDraftBounds(session.obstacleDraft);
  const placed = placeObstacleVolume(design, {
    id: occupantId,
    cornerA: bounds.min,
    cornerB: bounds.max,
    kind: session.obstacleKind
  });
  if (!placed.ok) return { session, result: { status: "error", message: placed.message } };
  return {
    session: { ...session, obstacleDraft: null },
    result: { status: "committed", design: placed.design }
  };
}

/**
 * The translucent preview of what would be placed at the hovered cell.
 *
 * Derived, never stored: computing it during render costs one pass instead of
 * the two an effect-plus-setState needed, and removes any chance of a stored
 * ghost disagreeing with the state it was meant to reflect.
 */
export function placementGhost(session: PlacementSession, design: DesignState): Ghost | null {
  const { tool, hoverCell } = session;
  if (!hoverCell || tool === "cursor" || tool === "erase") return null;
  switch (tool) {
    case "blower":
      return freePlacementGhost({
        type: "blower",
        design,
        cell: hoverCell,
        memory: session.freePlacementMemory,
        rotationSteps: session.freePlacementRotation
      });
    case "terminal":
      return freePlacementGhost({
        type: "terminal",
        design,
        cell: hoverCell,
        memory: session.freePlacementMemory,
        rotationSteps: session.freePlacementRotation
      });
    case "tube":
      return tubePlacementGhost(design, hoverCell);
    case "bend":
      return bendPlacementGhost(design, hoverCell, { rotationIndex: session.ghostRotation });
    case "obstacle":
      return obstaclePlacementGhost(session.obstacleDraft, hoverCell, session.obstacleKind);
    default:
      return null;
  }
}

/**
 * The cells the viewport highlights for the armed tool.
 *
 * For the tools that place a part, these are the legal targets, worked out
 * from the design and standing still under the pointer. The obstacle tool has
 * no such set — it draws on the placement plane, so every cell inside the
 * build area is a legal corner — and it highlights the one cell under the
 * cursor instead, which is the only thing there is to say about where a click
 * would land. Out-of-bounds cells stay unlit: the hover plane extends well
 * past the build area, and there is no grid out there to point at.
 */
export function placementLandingCells(session: PlacementSession, design: DesignState): Vec3[] {
  switch (session.tool) {
    case "blower":
    case "terminal":
      return freePlacementLandingCells(design);
    case "tube":
      return tubeLandingCells(design);
    case "bend":
      return bendLandingCells(design);
    case "obstacle":
      return session.hoverCell && design.grid.withinBounds(session.hoverCell)
        ? [session.hoverCell]
        : [];
    default:
      return [];
  }
}
