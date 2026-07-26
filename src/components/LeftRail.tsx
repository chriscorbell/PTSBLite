import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Icons, type IconProps } from "@/components/Icons";
import { PartThumbnail } from "@/components/PartThumbnail";
import { partRegistry } from "@/domain/part-registry";
import type { ToolId } from "@/types";
import "@/components/LeftRail.css";

type RailItem = {
  id: ToolId;
  icon: ComponentType<IconProps>;
  label: string;
  short?: string;
};

type BuildPart = {
  id: ToolId;
  regKey: string;
};

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
    <div ref={railRef} className="left-rail nosel">
      <RailButton
        item={{ id: "cursor", icon: Icons.Cursor, label: "Select", short: "V" }}
        active={tool === "cursor"}
        onClick={() => selectTool("cursor")}
      />
      <Divider />
      <BuildButton active={buildActive} open={buildOpen} onClick={() => setBuildOpen((o) => !o)} />
      <Divider />
      {TAIL_ITEMS.map((it) => (
        <RailButton
          key={it.id}
          item={it}
          active={tool === it.id}
          onClick={() => selectTool(it.id)}
        />
      ))}
      <div className="left-rail__clear-group">
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
  return <div className="left-rail__divider" />;
}

/**
 * A rail button and the tooltip that hangs off it.
 *
 * The tooltip is always in the DOM and revealed by CSS, which is what removed
 * the four `useState` hover flags and the render each cost per pointer move. It
 * is `aria-hidden` because it repeats the button's own accessible name; the
 * shortcut it also shows reaches assistive technology through
 * `aria-keyshortcuts` on the button, which is the attribute that actually means
 * "this control has a shortcut".
 */
function RailSlot({
  tooltip,
  open = false,
  children
}: {
  tooltip: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`left-rail__slot${open ? " left-rail__slot--open" : ""}`}>
      {children}
      <div className="left-rail__tooltip" aria-hidden="true">
        {tooltip}
      </div>
    </div>
  );
}

function BuildButton({
  active,
  open,
  onClick
}: {
  active: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <RailSlot open={open} tooltip={<div className="left-rail__tooltip-title">Build</div>}>
      <button
        className="left-rail__button"
        onClick={onClick}
        aria-label="Build"
        aria-expanded={open}
        aria-pressed={active}
      >
        <Icons.Hammer size={18} />
      </button>
    </RailSlot>
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
      inert={!open}
      className={`left-rail__drawer${open ? " left-rail__drawer--open" : ""}`}
    >
      <div className="left-rail__drawer-title">Parts</div>
      <div className="left-rail__parts">
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
  const entry = partRegistry.get(part.regKey);
  return (
    <button
      className="part-card"
      onClick={onClick}
      title={entry.name}
      aria-label={entry.name}
      aria-pressed={active}
    >
      <div className="part-card__preview">
        <PartThumbnail type={entry.type} color={entry.color} />
      </div>
      <div>
        <div className="part-card__name">{entry.name}</div>
        <div className="part-card__part-no">{entry.partNo}</div>
      </div>
    </button>
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
  const ItemIcon = icon;
  return (
    <RailSlot tooltip={<div className="left-rail__tooltip-title">{tooltip}</div>}>
      <button
        className="left-rail__button left-rail__button--danger"
        onClick={onClick}
        aria-label={tooltip}
        disabled={disabled}
      >
        <ItemIcon size={17} />
      </button>
    </RailSlot>
  );
}

function RailButton({
  item,
  active,
  onClick
}: {
  item: RailItem;
  active: boolean;
  onClick: () => void;
}) {
  const ItemIcon = item.icon;
  return (
    <RailSlot
      tooltip={
        <div className="left-rail__tooltip-title">
          {item.label}
          {item.short ? <span className="left-rail__tooltip-shortcut">{item.short}</span> : null}
        </div>
      }
    >
      <button
        className="left-rail__button"
        onClick={onClick}
        aria-label={item.label}
        aria-pressed={active}
        aria-keyshortcuts={item.short}
        // Don't take focus on mouse click, otherwise the focus ring lingers on
        // the button after the tool is changed elsewhere (e.g. Esc to cancel).
        // Keyboard focus (Tab) still works and shows the ring via :focus-visible.
        onMouseDown={(e) => e.preventDefault()}
      >
        <ItemIcon size={17} />
      </button>
    </RailSlot>
  );
}
