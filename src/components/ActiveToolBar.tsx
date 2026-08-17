import { partRegistry } from "@/domain/part-registry";
import "@/components/ActiveToolBar.css";
import type { ToolId } from "@/types";

/**
 * The pill along the bottom of the viewport naming the active tool and its
 * shortcuts. Shown for every tool except the inert cursor.
 *
 * Part names and numbers come from the catalog rather than being restated
 * here — ADR-0001 requires user-facing copy to interpolate reference data.
 * Obstacles are not parts (see CONTEXT.md) and the two non-placing tools have
 * no catalog entry, so those three keep literal labels.
 */
const TOOL_LABELS: Record<ToolId, string> = {
  cursor: "Select",
  blower: catalogLabel("blower"),
  terminal: catalogLabel("terminal"),
  tube: catalogLabel("tube6"),
  bend: catalogLabel("bend90"),
  obstacle: "Obstacle volume",
  erase: "Erase"
};

/** "<name> · <part number>", read from the catalog rather than restated here. */
function catalogLabel(registryKey: string): string {
  const { name, partNo } = partRegistry.get(registryKey);
  return `${name} · ${partNo}`;
}

export function ActiveToolBar({
  tool,
  elevation,
  floor
}: {
  tool: ToolId;
  /** Y of the active placement plane, shown so the elevation keys are not blind. */
  elevation: number;
  /** Which floor that plane is on, or null for a single-floor design. */
  floor: 1 | 2 | null;
}) {
  if (tool === "cursor") return null;
  const placesPart = tool === "blower" || tool === "terminal" || tool === "tube" || tool === "bend";
  const usesElevation = placesPart || tool === "obstacle";
  return (
    <div className="active-tool-bar">
      <span className="active-tool-bar__dot" />
      <span className="active-tool-bar__label">Tool</span>
      <span className="active-tool-bar__tool">{TOOL_LABELS[tool]}</span>
      {usesElevation && (
        <>
          <span className="active-tool-bar__sep" />
          <span className="active-tool-bar__elevation">
            EL {elevation} ft{floor !== null && ` · Floor ${floor}`}
          </span>
          <span className="active-tool-bar__hint">
            <kbd>[</kbd>
            <span>/</span>
            <kbd>]</kbd>
            <span>elevation</span>
          </span>
          <span className="active-tool-bar__sep" />
          {placesPart && (
            <span className="active-tool-bar__hint">
              <kbd>R</kbd>
              <span>/</span>
              <kbd>Shift+R</kbd>
              <span>rotate</span>
            </span>
          )}
          <span className="active-tool-bar__hint">
            <kbd>Esc</kbd> cancel
          </span>
        </>
      )}
    </div>
  );
}
