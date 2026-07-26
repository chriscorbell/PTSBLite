import { partRegistry } from "@/domain/part-registry";
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

const kbdStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  padding: "1px 6px",
  borderRadius: 3,
  border: "1px solid var(--line-2)",
  background: "var(--panel-2)",
  color: "var(--text)"
} as const;

export function ActiveToolBar({ tool }: { tool: ToolId }) {
  if (tool === "cursor") return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(11,14,19,0.92)",
        border: "1px solid var(--line-2)",
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 12,
        color: "var(--text)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        pointerEvents: "none",
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
      <span style={{ color: "var(--text-mut)" }}>Tool</span>
      <span style={{ fontWeight: 600 }}>{TOOL_LABELS[tool]}</span>
      {(tool === "blower" ||
        tool === "terminal" ||
        tool === "tube" ||
        tool === "bend" ||
        tool === "obstacle") && (
        <>
          <span style={{ width: 1, height: 14, background: "var(--line)" }} />
          {(tool === "blower" || tool === "terminal" || tool === "tube" || tool === "bend") && (
            <span
              style={{
                color: "var(--text-mut)",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              <kbd style={kbdStyle}>R</kbd>
              <span>/</span>
              <kbd style={kbdStyle}>Shift+R</kbd>
              <span>rotate</span>
            </span>
          )}
          <span
            style={{
              color: "var(--text-mut)",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <kbd style={kbdStyle}>Esc</kbd> cancel
          </span>
        </>
      )}
    </div>
  );
}
