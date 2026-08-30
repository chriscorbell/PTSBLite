import { Icons } from "@/components/Icons";
import {
  obstaclePlacementDraftHasFootprint,
  type ObstacleKind,
  type ObstaclePlacementDraft
} from "@/domain/obstacle-placement";
import { MAX_RUN_HEIGHT_FEET } from "@/domain/pathfinder";
import type { Scene, ToolId } from "@/types";
import "@/components/ViewportHUD.css";

export type ViewportHUDProps = {
  scene: Scene;
  tool: ToolId;
  autoBuilding: boolean;
  errorFlash: string | null;
  /** Which floor the placement plane is on; null hides the floor selector. */
  activeFloor: 1 | 2 | null;
  onSelectFloor: (floor: 1 | 2) => void;
  /** What the obstacle tool draws; its selector shows while the tool is armed. */
  obstacleKind: ObstacleKind;
  onObstacleKindChange: (kind: ObstacleKind) => void;
  obstacleDraft: ObstaclePlacementDraft | null;
  /** Bounds the height stepper, so it cannot offer a value the domain rejects. */
  obstacleMaxHeight: number;
  onObstacleHeightChange: (height: number) => void;
  onObstacleConfirm: () => void;
  onObstacleCancel: () => void;
};

export function ViewportHUD({
  scene,
  tool,
  errorFlash,
  activeFloor,
  onSelectFloor,
  obstacleKind,
  onObstacleKindChange,
  obstacleDraft,
  obstacleMaxHeight,
  onObstacleHeightChange,
  onObstacleConfirm,
  onObstacleCancel
}: ViewportHUDProps) {
  const obstacleReady = obstaclePlacementDraftHasFootprint(obstacleDraft);
  // The domain clamps this too; disabling here is what stops the control
  // advertising a value it would then silently refuse.
  const atCeiling = obstacleReady && obstacleDraft.height >= obstacleMaxHeight;
  return (
    <div className="hud nosel">
      {tool === "obstacle" && (
        <div className="hud__obstacle-kind" role="group" aria-label="Obstacle type">
          {(["impenetrable", "penetrable"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="hud__floor"
              aria-pressed={obstacleKind === kind}
              title={
                kind === "penetrable"
                  ? "Tubes can pass through this volume"
                  : "Placement and routing must avoid this volume"
              }
              onClick={() => onObstacleKindChange(kind)}
            >
              {kind === "penetrable" ? "Penetrable" : "Impenetrable"}
            </button>
          ))}
        </div>
      )}
      {activeFloor !== null && (
        <div className="hud__floors" role="group" aria-label="Active floor">
          {([1, 2] as const).map((floor) => (
            <button
              key={floor}
              type="button"
              className="hud__floor"
              aria-pressed={activeFloor === floor}
              title={`Place on floor ${floor} (${floor})`}
              onClick={() => onSelectFloor(floor)}
            >
              Floor {floor}
            </button>
          ))}
        </div>
      )}
      {obstacleReady && (
        <div className="hud__obstacle-controls">
          <Icons.Obstacle size={12} className="hud__obstacle-icon" />
          {/* Height only: an obstacle stands on the floor of the storey it was
              drawn on, so there is no base to set. */}
          <ObstacleStepper
            label="Height"
            value={`${obstacleDraft.height}ft`}
            onDecrement={() => onObstacleHeightChange(obstacleDraft.height - 1)}
            onIncrement={() => onObstacleHeightChange(obstacleDraft.height + 1)}
            disableDecrement={obstacleDraft.height <= 1}
            disableIncrement={atCeiling}
          />
          <button type="button" className="hud__place" onClick={onObstacleConfirm}>
            Place
          </button>
          <button
            type="button"
            className="hud__cancel"
            aria-label="Cancel obstacle placement"
            onClick={onObstacleCancel}
          >
            <Icons.Close size={12} />
          </button>
        </div>
      )}

      {scene.autoBuildJustRan && scene.autoBuildSummary && (
        <div className="hud__banner hud__banner--summary">
          <div className="hud__banner-title">
            Auto-Build complete · {scene.autoBuildSummary.lengthFeet.toFixed(1)}ft ·{" "}
            {pluralize(scene.autoBuildSummary.bends, "bend")}
          </div>
          {(scene.autoBuildSummary.obstacles > 0 || scene.autoBuildSummary.unrouted > 0) && (
            <div className="hud__banner-detail">
              {[
                scene.autoBuildSummary.obstacles > 0
                  ? `Routed around ${pluralize(scene.autoBuildSummary.obstacles, "obstacle")}`
                  : null,
                scene.autoBuildSummary.unrouted > 0
                  ? `${pluralize(scene.autoBuildSummary.unrouted, "pair")} unrouted`
                  : null
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {/* The client's own wording for each case, kept as he wrote it. */}
          {scene.autoBuildSummary.runBand === "plenum" && (
            <div className="hud__banner-detail">Auto-build favors plenum when available</div>
          )}
          {scene.autoBuildSummary.runBand === "ghost-ceiling" && (
            <div className="hud__banner-detail">
              Autobuild stops at {MAX_RUN_HEIGHT_FEET}ft - please try building manually if you need
              more rise.
            </div>
          )}
        </div>
      )}

      {errorFlash && <div className="hud__banner hud__banner--error">{errorFlash}</div>}
    </div>
  );
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function ObstacleStepper({
  label,
  value,
  onDecrement,
  onIncrement,
  disableDecrement = false,
  disableIncrement = false
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disableDecrement?: boolean;
  disableIncrement?: boolean;
}) {
  return (
    <div className="hud__stepper">
      <span className="hud__stepper-label">{label}</span>
      <button
        type="button"
        className="hud__stepper-button"
        aria-label={`Decrease obstacle ${label.toLowerCase()}`}
        disabled={disableDecrement}
        onClick={onDecrement}
      >
        −
      </button>
      <span className="hud__stepper-value">{value}</span>
      <button
        type="button"
        className="hud__stepper-button"
        aria-label={`Increase obstacle ${label.toLowerCase()}`}
        disabled={disableIncrement}
        onClick={onIncrement}
      >
        +
      </button>
    </div>
  );
}
