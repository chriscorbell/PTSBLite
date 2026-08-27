import {
  Check,
  FilePlus2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  Eraser,
  FileText,
  Hammer,
  Info,
  Layers,
  MousePointer2,
  Redo2,
  RefreshCw,
  RotateCw,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon
} from "lucide-react";
import type { ReactNode, SVGProps } from "react";

export type IconProps = {
  size?: number;
  stroke?: number;
  /** Colour and spacing come from a class, never an inline style (ADR-0009). */
  className?: string;
};

const DEFAULT_SIZE = 16;
// lucide defaults to a stroke of 2, which reads noticeably heavier than the rest
// of this UI at the 12-18px sizes it uses. 1.5 matches the weight the hand-drawn
// set was tuned to, so swapping the source of these glyphs does not change how
// dense the chrome looks.
const DEFAULT_STROKE = 1.5;

/**
 * Adapt a lucide icon to the local {@link IconProps} shape, so call sites keep
 * passing `size` / `stroke` and never import from lucide directly. Keeping this
 * seam means the icon source can change again without touching components.
 */
function fromLucide(Glyph: LucideIcon) {
  return function LucideIconAdapter({
    size = DEFAULT_SIZE,
    stroke = DEFAULT_STROKE,
    className
  }: IconProps) {
    return <Glyph size={size} strokeWidth={stroke} className={className} />;
  };
}

type InternalIconProps = IconProps & {
  d?: string;
  viewBox?: string;
  children?: ReactNode;
  extra?: SVGProps<SVGPathElement>;
};

/**
 * Renderer for the glyphs lucide cannot supply — the pneumatic-tube parts, the
 * obstacle pair, and GitHub (dropped from lucide when it removed brand icons).
 * Matches lucide's own attributes so the two sets sit together cleanly.
 */
function Icon({
  d,
  size = DEFAULT_SIZE,
  stroke = DEFAULT_STROKE,
  children,
  viewBox = "0 0 24 24",
  className
}: InternalIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const Icons = {
  // --- lucide-backed -------------------------------------------------------
  Cursor: fromLucide(MousePointer2),
  Erase: fromLucide(Eraser),
  New: fromLucide(FilePlus2),
  Pdf: fromLucide(FileText),
  Auto: fromLucide(RefreshCw),
  Warn: fromLucide(TriangleAlert),
  Info: fromLucide(Info),
  Check: fromLucide(Check),
  ChevD: fromLucide(ChevronDown),
  ChevU: fromLucide(ChevronUp),
  Close: fromLucide(X),
  Undo: fromLucide(Undo2),
  Redo: fromLucide(Redo2),
  Layers: fromLucide(Layers),
  Download: fromLucide(Download),
  Bom: fromLucide(ClipboardList),
  Trash: fromLucide(Trash2),
  Hammer: fromLucide(Hammer),
  Refresh: fromLucide(RotateCw),

  // --- domain glyphs, drawn here because lucide has no equivalent ----------
  // A blower housing with its outlet and intake louvres.
  Blower: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="7" width="11" height="10" rx="1.2" />
      <path d="M14 9.5h5l1 2v1l-1 2h-5" />
      <path d="M6 11v2" />
      <path d="M9 11v2" />
    </Icon>
  ),
  // A send/receive station. Deliberately not lucide's `Terminal`, which is a
  // command prompt and would read as the wrong kind of terminal entirely.
  Terminal: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3" />
      <path d="M12 17v3" />
    </Icon>
  ),
  // Straight tube, showing the 6ft section joints.
  Tube: (p: IconProps) => (
    <Icon {...p}>
      <rect x="2" y="9" width="20" height="6" rx="0.5" />
      <path d="M6 9v6" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
      <path d="M18 9v6" />
    </Icon>
  ),
  // A 90 degree bend, drawn as the inner and outer walls of the turn.
  Bend: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 15h6a6 6 0 0 0 6-6V3" />
      <path d="M3 19h6a10 10 0 0 0 10-10V3" />
    </Icon>
  ),
  // Obstacle volume, and clearing them: a matched pair, so both stay hand-drawn
  // rather than one picking up a lucide glyph and breaking the rhyme.
  Obstacle: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2 2" />
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </Icon>
  ),
  TrashObstacle: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11l4 6" />
      <path d="M14 11l-4 6" />
    </Icon>
  ),
  // Clearing an Auto-Build: the same can, holding a routed run with its bend.
  TrashAutoBuild: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9.5 17v-2.5h5V12" />
    </Icon>
  ),
  // lucide 1.x removed brand icons, so this keeps lucide's old github path.
  Github: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </Icon>
  )
};
