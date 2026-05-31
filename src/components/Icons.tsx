import type { CSSProperties, ReactNode, SVGProps } from "react";

export type IconProps = {
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
};

type InternalIconProps = IconProps & {
  d?: string;
  viewBox?: string;
  children?: ReactNode;
  extra?: SVGProps<SVGPathElement>;
};

function Icon({ d, size = 16, stroke = 1.5, children, viewBox = "0 0 24 24", style, className }: InternalIconProps) {
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
      style={style}
      className={className}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const Icons = {
  Cursor: (p: IconProps) => (
    <Icon {...p}>
      <path d="M5 3l5 16 2.5-6.5L19 10z" />
    </Icon>
  ),
  Blower: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="7" width="11" height="10" rx="1.2" />
      <path d="M14 9.5h5l1 2v1l-1 2h-5" />
      <path d="M6 11v2" />
      <path d="M9 11v2" />
    </Icon>
  ),
  Terminal: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3" />
      <path d="M12 17v3" />
    </Icon>
  ),
  Tube: (p: IconProps) => (
    <Icon {...p}>
      <rect x="2" y="9" width="20" height="6" rx="0.5" />
      <path d="M6 9v6" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
      <path d="M18 9v6" />
    </Icon>
  ),
  Bend: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 15h6a6 6 0 0 0 6-6V3" />
      <path d="M3 19h6a10 10 0 0 0 10-10V3" />
    </Icon>
  ),
  Obstacle: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2 2" />
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </Icon>
  ),
  Erase: (p: IconProps) => (
    <Icon {...p}>
      <path d="M16 4l4 4-9 9H7l-3-3z" />
      <path d="M9 17H20" />
    </Icon>
  ),
  Save: (p: IconProps) => (
    <Icon {...p}>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 4v5h7V4" />
      <rect x="8" y="13" width="8" height="6" rx="0.5" />
    </Icon>
  ),
  Open: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </Icon>
  ),
  Pdf: (p: IconProps) => (
    <Icon {...p}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v4h4" />
      <path d="M8 13h2a1.5 1.5 0 0 1 0 3H8z" />
      <path d="M8 13v6" />
      <path d="M14 13v6" />
      <path d="M14 16h2" />
    </Icon>
  ),
  Auto: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 4v4h-4" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 20v-4h4" />
    </Icon>
  ),
  Warn: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 3l10 17H2z" />
      <path d="M12 10v5" />
      <path d="M12 18.5v.01" />
    </Icon>
  ),
  Check: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 12l5 5 11-12" />
    </Icon>
  ),
  ChevR: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  ),
  ChevL: (p: IconProps) => (
    <Icon {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  ),
  ChevD: (p: IconProps) => (
    <Icon {...p}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  ),
  ChevU: (p: IconProps) => (
    <Icon {...p}>
      <path d="M6 15l6-6 6 6" />
    </Icon>
  ),
  Close: (p: IconProps) => (
    <Icon {...p}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Icon>
  ),
  Plus: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  ),
  Minus: (p: IconProps) => (
    <Icon {...p}>
      <path d="M5 12h14" />
    </Icon>
  ),
  Rotate: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </Icon>
  ),
  Undo: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H8" />
    </Icon>
  ),
  Redo: (p: IconProps) => (
    <Icon {...p}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H16" />
    </Icon>
  ),
  Grid: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </Icon>
  ),
  ZoomIn: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-5-5" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </Icon>
  ),
  ZoomOut: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-5-5" />
      <path d="M8 11h6" />
    </Icon>
  ),
  Orbit: (p: IconProps) => (
    <Icon {...p}>
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  Layers: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Icon>
  ),
  Box: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4" />
      <path d="M12 11v10" />
    </Icon>
  ),
  Download: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 4v12" />
      <path d="M6 11l6 6 6-6" />
      <path d="M4 20h16" />
    </Icon>
  ),
  Print: (p: IconProps) => (
    <Icon {...p}>
      <path d="M7 8V4h10v4" />
      <rect x="3" y="8" width="18" height="9" rx="1" />
      <rect x="7" y="15" width="10" height="6" />
    </Icon>
  ),
  Tag: (p: IconProps) => (
    <Icon {...p}>
      <path d="M11 3H4a1 1 0 0 0-1 1v7l10 10 8-8z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </Icon>
  ),
  Bom: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </Icon>
  ),
  Trash: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
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
  Hammer: (p: IconProps) => (
    <Icon {...p}>
      <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h.86c.85 0 1.65.34 2.25.93l1.25 1.25" />
    </Icon>
  )
};

export type IconKey = keyof typeof Icons;
