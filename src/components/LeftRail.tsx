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
  /** Draws the thumbnail standing on its mast. The catalog says a pedestal
   * blower *is* a blower, which is true of the part but not of its picture. */
  pedestal?: boolean;
};

const BUILD_PARTS: BuildPart[] = [
  { id: "blower", regKey: "blower" },
  { id: "blowerPedestal", regKey: "blowerPedestal", pedestal: true },
  { id: "terminal", regKey: "terminal" },
  { id: "tube", regKey: "tube6" },
  { id: "bend", regKey: "bend90" }
];

const BUILD_TOOLS = new Set<ToolId>(BUILD_PARTS.map((p) => p.id));

/** What the erase drawer offers, in the order it destroys more at a time. */
type EraseAction = {
  key: string;
  icon: ComponentType<IconProps>;
  label: string;
  detail: string;
};

export type LeftRailProps = {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  partCount: number;
  obstacleCount: number;
  /** How many parts in the design Auto-Build placed; 0 disables clearing them. */
  autoBuildPartCount: number;
  onClearParts: () => void;
  onClearObstacles: () => void;
  onClearAutoBuild: () => void;
};

/**
 * The tool rail: four tools, evenly divided.
 *
 * Erase used to be one button beside three separate clear-everything buttons
 * stacked under the rail, which put four destructive controls on screen at all
 * times and gave the rail two different visual rhythms. The client asked to
 * "condense erase, delete all parts, delete all obstacles, and delete all
 * auto-build into its own category" that opens like Build and Obstacle do.
 */
export function LeftRail({
  tool,
  onTool,
  partCount,
  obstacleCount,
  autoBuildPartCount,
  onClearParts,
  onClearObstacles,
  onClearAutoBuild
}: LeftRailProps) {
  const [openDrawer, setOpenDrawer] = useState<"build" | "erase" | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const buildActive = BUILD_TOOLS.has(tool);

  useEffect(() => {
    if (!openDrawer) return;
    const onPointerDown = (event: PointerEvent) => {
      if (railRef.current?.contains(event.target as Node)) return;
      setOpenDrawer(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDrawer(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openDrawer]);

  const selectTool = (id: ToolId) => {
    onTool(id);
    setOpenDrawer(null);
  };

  const eraseActions: EraseAction[] = [
    {
      key: "parts",
      icon: Icons.Trash,
      label: "Clear all parts",
      detail: `${partCount} placed`
    },
    {
      key: "obstacles",
      icon: Icons.TrashObstacle,
      label: "Clear all obstacles",
      detail: `${obstacleCount} placed`
    },
    {
      key: "auto",
      icon: Icons.TrashAutoBuild,
      label: "Clear Auto-Build",
      detail: `${autoBuildPartCount} placed`
    }
  ];
  const eraseHandlers: Record<string, { run: () => void; disabled: boolean }> = {
    parts: { run: onClearParts, disabled: partCount === 0 },
    obstacles: { run: onClearObstacles, disabled: obstacleCount === 0 },
    auto: { run: onClearAutoBuild, disabled: autoBuildPartCount === 0 }
  };

  return (
    <div ref={railRef} className="left-rail nosel">
      <RailButton
        item={{ id: "cursor", icon: Icons.Cursor, label: "Select", short: "V" }}
        active={tool === "cursor"}
        onClick={() => selectTool("cursor")}
      />
      <Divider />
      <DrawerButton
        label="Build"
        icon={Icons.Hammer}
        active={buildActive}
        open={openDrawer === "build"}
        onClick={() => setOpenDrawer((d) => (d === "build" ? null : "build"))}
      />
      <Divider />
      <RailButton
        item={{ id: "obstacle", icon: Icons.Obstacle, label: "Obstacle", short: "O" }}
        active={tool === "obstacle"}
        onClick={() => selectTool("obstacle")}
      />
      <Divider />
      <DrawerButton
        label="Erase"
        icon={Icons.Erase}
        active={tool === "erase"}
        open={openDrawer === "erase"}
        onClick={() => setOpenDrawer((d) => (d === "erase" ? null : "erase"))}
      />
      <BuildDrawer open={openDrawer === "build"} tool={tool} onSelect={selectTool} />
      <EraseDrawer
        open={openDrawer === "erase"}
        eraseArmed={tool === "erase"}
        actions={eraseActions}
        onArmErase={() => selectTool("erase")}
        onRun={(key) => {
          setOpenDrawer(null);
          eraseHandlers[key]?.run();
        }}
        isDisabled={(key) => eraseHandlers[key]?.disabled ?? true}
      />
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

/** A rail button that opens a drawer rather than arming a tool directly. */
function DrawerButton({
  label,
  icon,
  active,
  open,
  onClick
}: {
  label: string;
  icon: ComponentType<IconProps>;
  active: boolean;
  open: boolean;
  onClick: () => void;
}) {
  const Glyph = icon;
  return (
    <RailSlot open={open} tooltip={<div className="left-rail__tooltip-title">{label}</div>}>
      <button
        className="left-rail__button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={open}
        aria-pressed={active}
      >
        <Glyph size={24} />
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

/**
 * The erase drawer: arming the eraser, then the three clear-everything actions.
 *
 * The eraser sits at the top because it is the one that is a tool rather than a
 * command — you arm it and then click things. The three below it act at once,
 * so each says how much it would remove and goes quiet when that is nothing.
 */
function EraseDrawer({
  open,
  eraseArmed,
  actions,
  onArmErase,
  onRun,
  isDisabled
}: {
  open: boolean;
  eraseArmed: boolean;
  actions: EraseAction[];
  onArmErase: () => void;
  onRun: (key: string) => void;
  isDisabled: (key: string) => boolean;
}) {
  return (
    <div
      role="menu"
      inert={!open}
      className={`left-rail__drawer${open ? " left-rail__drawer--open" : ""}`}
    >
      <div className="left-rail__drawer-title">Erase</div>
      <button className="erase-card" onClick={onArmErase} aria-pressed={eraseArmed}>
        <Icons.Erase size={18} className="erase-card__icon" />
        <span className="erase-card__text">
          <span className="erase-card__label">Eraser</span>
          <span className="erase-card__detail">Right click a part to remove it</span>
        </span>
      </button>
      <div className="left-rail__drawer-divider" />
      {actions.map((action) => {
        const Glyph = action.icon;
        return (
          <button
            key={action.key}
            className="erase-card erase-card--danger"
            onClick={() => onRun(action.key)}
            disabled={isDisabled(action.key)}
          >
            <Glyph size={18} className="erase-card__icon" />
            <span className="erase-card__text">
              <span className="erase-card__label">{action.label}</span>
              <span className="erase-card__detail">{action.detail}</span>
            </span>
          </button>
        );
      })}
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
        <PartThumbnail type={entry.type} color={entry.color} pedestal={part.pedestal} />
      </div>
      <div>
        <div className="part-card__name">{entry.name}</div>
        <div className="part-card__part-no">{entry.partNo}</div>
      </div>
    </button>
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
        <ItemIcon size={23} />
      </button>
    </RailSlot>
  );
}
