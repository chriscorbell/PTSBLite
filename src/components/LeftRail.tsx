import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Icons, type IconProps } from "@/components/Icons";
import { PartThumbnail } from "@/components/PartThumbnail";
import { partRegistry } from "@/domain/part-registry";
import type { ToolId } from "@/types";

type RailItem = {
  id: ToolId;
  icon: ComponentType<IconProps>;
  label: string;
  pn?: string;
  short?: string;
};

type BuildPart = {
  id: ToolId;
  regKey: string;
};

const monoStyle = { fontFamily: "var(--font-mono)" } as const;

const BUILD_PARTS: BuildPart[] = [
  { id: "blower", regKey: "blower" },
  { id: "terminal", regKey: "terminal" },
  { id: "tube", regKey: "tube6" },
  { id: "bend", regKey: "bend90" }
];

const BUILD_TOOLS = new Set<ToolId>(BUILD_PARTS.map((p) => p.id));

const TAIL_ITEMS: RailItem[] = [
  { id: "obstacle", icon: Icons.Obstacle, label: "Obstacle", short: "O" },
  { id: "erase", icon: Icons.Erase, label: "Erase", short: "X" }
];

export type LeftRailProps = {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  partCount: number;
  obstacleCount: number;
  onClearParts: () => void;
  onClearObstacles: () => void;
};

export function LeftRail({
  tool,
  onTool,
  partCount,
  obstacleCount,
  onClearParts,
  onClearObstacles
}: LeftRailProps) {
  const [buildOpen, setBuildOpen] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const buildActive = BUILD_TOOLS.has(tool);

  useEffect(() => {
    if (!buildOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (railRef.current?.contains(event.target as Node)) return;
      setBuildOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBuildOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [buildOpen]);

  const selectTool = (id: ToolId) => {
    onTool(id);
    setBuildOpen(false);
  };

  return (
    <div
      ref={railRef}
      className="nosel"
      style={{
        position: "relative",
        width: 48,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        padding: "8px 6px",
        gap: 3,
        background: "var(--panel)",
        borderRight: "1px solid var(--line)",
        zIndex: 5
      }}
    >
      <RailButton
        item={{ id: "cursor", icon: Icons.Cursor, label: "Select", short: "V" }}
        active={tool === "cursor"}
        onClick={() => selectTool("cursor")}
      />
      <Divider />
      <BuildButton active={buildActive} open={buildOpen} onClick={() => setBuildOpen((o) => !o)} />
      <Divider />
      {TAIL_ITEMS.map((it) => (
        <RailButton key={it.id} item={it} active={tool === it.id} onClick={() => selectTool(it.id)} />
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
        <ClearActionButton
          icon={Icons.Trash}
          tooltip="Clear All Parts"
          disabled={partCount === 0}
          onClick={onClearParts}
        />
        <ClearActionButton
          icon={Icons.TrashObstacle}
          tooltip="Clear All Obstacles"
          disabled={obstacleCount === 0}
          onClick={onClearObstacles}
        />
      </div>
      <BuildDrawer open={buildOpen} tool={tool} onSelect={selectTool} />
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--line)", margin: "4px 8px" }} />;
}

function BuildButton({ active, open, onClick }: { active: boolean; open: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const lit = active || open;
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        onClick={onClick}
        aria-expanded={open}
        style={{
          width: "100%",
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          borderRadius: 7,
          background: lit
            ? "color-mix(in oklab, var(--accent) 18%, transparent)"
            : hover
              ? "var(--panel-2)"
              : "transparent",
          color: lit ? "var(--accent)" : "var(--text-mut)",
          border:
            "1px solid " + (lit ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "transparent"),
          cursor: "pointer",
          transition: "all .12s"
        }}
      >
        <Icons.Hammer size={18} />
      </button>
      {hover && !open && (
        <RailTooltip>
          <div style={{ fontWeight: 600 }}>Build</div>
        </RailTooltip>
      )}
    </div>
  );
}

function BuildDrawer({
  open,
  tool,
  onSelect
}: {
  open: boolean;
  tool: ToolId;
  onSelect: (id: ToolId) => void;
}) {
  return (
    <div
      role="menu"
      aria-hidden={!open}
      style={{
        position: "absolute",
        left: "100%",
        top: 0,
        bottom: 0,
        width: 252,
        background: "var(--panel)",
        borderRight: "1px solid var(--line)",
        boxShadow: open ? "8px 0 28px rgba(0,0,0,0.45)" : "none",
        display: "flex",
        flexDirection: "column",
        padding: "12px 12px 14px",
        zIndex: 6,
        transform: open ? "translateX(0)" : "translateX(-8px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "transform .16s ease, opacity .16s ease"
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          fontSize: 12,
          color: "var(--text)",
          marginBottom: 10
        }}
      >
        Parts
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {BUILD_PARTS.map((part) => (
          <PartCard
            key={part.id}
            part={part}
            active={tool === part.id}
            onClick={() => onSelect(part.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PartCard({
  part,
  active,
  onClick
}: {
  part: BuildPart;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const entry = partRegistry.get(part.regKey);
  const lit = active || hover;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={entry.name}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        minWidth: 0,
        gap: 7,
        padding: 8,
        borderRadius: 8,
        background: active ? "color-mix(in oklab, var(--accent) 12%, var(--panel-2))" : "var(--panel-2)",
        border:
          "1px solid " +
          (lit ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--line)"),
        color: active ? "var(--accent)" : "var(--text)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background .12s, border-color .12s"
      }}
    >
      <div
        style={{
          height: 56,
          padding: 4,
          borderRadius: 6,
          background: "var(--ink)",
          border: "1px solid var(--line)"
        }}
      >
        <PartThumbnail type={entry.type} color={entry.color} />
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: active ? "var(--accent)" : "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {entry.name}
        </div>
        <div
          style={{
            ...monoStyle,
            fontSize: 9.5,
            color: "var(--text-dim)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {entry.partNo}
        </div>
      </div>
    </button>
  );
}

function RailTooltip({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "calc(100% + 8px)",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 50,
        background: "var(--ink)",
        color: "var(--text)",
        border: "1px solid var(--line-2)",
        padding: "6px 10px",
        borderRadius: 6,
        fontSize: 12,
        whiteSpace: "nowrap",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        pointerEvents: "none"
      }}
    >
      {children}
    </div>
  );
}

function ClearActionButton({
  icon,
  tooltip,
  disabled,
  onClick
}: {
  icon: ComponentType<IconProps>;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const active = hover && !disabled;
  const ItemIcon = icon;
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: "100%",
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          borderRadius: 7,
          background: active ? "color-mix(in oklab, var(--danger) 16%, transparent)" : "transparent",
          color: disabled
            ? "color-mix(in oklab, var(--text-dim) 60%, transparent)"
            : active
              ? "var(--danger)"
              : "var(--text-mut)",
          border:
            "1px solid " +
            (active ? "color-mix(in oklab, var(--danger) 34%, transparent)" : "transparent"),
          cursor: disabled ? "default" : "pointer",
          transition: "all .12s"
        }}
      >
        <ItemIcon size={17} />
      </button>
      {hover && (
        <div
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 50,
            background: "var(--ink)",
            color: "var(--text)",
            border: "1px solid var(--line-2)",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            pointerEvents: "none"
          }}
        >
          <div style={{ fontWeight: 600 }}>{tooltip}</div>
        </div>
      )}
    </div>
  );
}

function RailButton({ item, active, onClick }: { item: RailItem; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const ItemIcon = item.icon;
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        onClick={onClick}
        // Don't take focus on mouse click, otherwise the focus ring lingers on
        // the button after the tool is changed elsewhere (e.g. Esc to cancel).
        // Keyboard focus (Tab) still works and shows the ring via :focus-visible.
        onMouseDown={(e) => e.preventDefault()}
        style={{
          width: "100%",
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          borderRadius: 7,
          background: active
            ? "color-mix(in oklab, var(--accent) 18%, transparent)"
            : hover
              ? "var(--panel-2)"
              : "transparent",
          color: active ? "var(--accent)" : "var(--text-mut)",
          border:
            "1px solid " +
            (active ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "transparent"),
          cursor: "pointer",
          transition: "all .12s"
        }}
      >
        <ItemIcon size={17} />
      </button>
      {hover && (
        <div
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 50,
            background: "var(--ink)",
            color: "var(--text)",
            border: "1px solid var(--line-2)",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            pointerEvents: "none"
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {item.label}
            {item.short ? (
              <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: 8 }}>{item.short}</span>
            ) : null}
          </div>
          {item.pn && (
            <div style={{ ...monoStyle, fontSize: 10, color: "var(--text-mut)", marginTop: 2 }}>
              {item.pn}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
