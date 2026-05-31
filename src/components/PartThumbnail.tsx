// Isometric, shaded part illustrations for the Build drawer. Each part is drawn
// from simple 3D primitives (boxes / cylinders) projected through a shared iso
// transform, then face-mounted details (fan grille, ports) are placed with a
// per-face affine matrix so circles sit on the correct plane.

type Vec3 = [number, number, number];

const S = 6.5;
const OX = 32;
const OY = 31;
const COS = 0.866;

function iso(x: number, y: number, z: number): [number, number] {
  return [OX + (x - z) * COS * S, OY + (x + z) * 0.5 * S - y * S];
}

// Screen-space delta for a 3D direction (no origin offset).
function projDir(x: number, y: number, z: number): [number, number] {
  return [(x - z) * COS * S, (x + z) * 0.5 * S - y * S];
}

function shade(hex: string, pct: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  if (pct >= 0) {
    r += (255 - r) * pct;
    g += (255 - g) * pct;
    b += (255 - b) * pct;
  } else {
    const p = 1 + pct;
    r *= p;
    g *= p;
    b *= p;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function polyPoints(pts: Vec3[]): string {
  return pts.map(([x, y, z]) => iso(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");
}

// Affine matrix mapping a 2D (u, v) face plane to screen, given the two 3D axis
// directions of the plane and the 3D point that maps to local origin.
function faceMatrix(uDir: Vec3, vDir: Vec3, originXYZ: Vec3): string {
  const u = projDir(...uDir);
  const v = projDir(...vDir);
  const [ox, oy] = iso(...originXYZ);
  return `matrix(${u[0].toFixed(3)},${u[1].toFixed(3)},${v[0].toFixed(3)},${v[1].toFixed(3)},${ox.toFixed(2)},${oy.toFixed(2)})`;
}

function Box({
  x0,
  x1,
  y0,
  y1,
  z0,
  z1,
  color
}: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  color: string;
}) {
  const edge = shade(color, -0.5);
  const top: Vec3[] = [
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1]
  ];
  const xFace: Vec3[] = [
    [x1, y0, z0],
    [x1, y0, z1],
    [x1, y1, z1],
    [x1, y1, z0]
  ];
  const zFace: Vec3[] = [
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1]
  ];
  return (
    <>
      <polygon points={polyPoints(zFace)} fill={shade(color, -0.22)} stroke={edge} strokeWidth={0.5} />
      <polygon points={polyPoints(xFace)} fill={color} stroke={edge} strokeWidth={0.5} />
      <polygon points={polyPoints(top)} fill={shade(color, 0.24)} stroke={edge} strokeWidth={0.5} />
    </>
  );
}

function Cylinder({
  c0,
  c1,
  r,
  basisA,
  basisB,
  color,
  capColor
}: {
  c0: Vec3;
  c1: Vec3;
  r: number;
  basisA: Vec3;
  basisB: Vec3;
  color: string;
  capColor: string;
}) {
  const s0 = iso(...c0);
  const s1 = iso(...c1);
  const ax = [s1[0] - s0[0], s1[1] - s0[1]];
  const len = Math.hypot(ax[0], ax[1]) || 1;
  const n: [number, number] = [-ax[1] / len, ax[0] / len];
  const uA = projDir(...basisA);
  const uB = projDir(...basisB);
  // Silhouette half-width: the cap ellipse's support along the screen normal n.
  let off = 0;
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const px = (Math.cos(t) * uA[0] + Math.sin(t) * uB[0]) * r;
    const py = (Math.cos(t) * uA[1] + Math.sin(t) * uB[1]) * r;
    off = Math.max(off, Math.abs(px * n[0] + py * n[1]));
  }
  const d: [number, number] = [n[0] * off, n[1] * off];
  const body = [
    [s0[0] + d[0], s0[1] + d[1]],
    [s1[0] + d[0], s1[1] + d[1]],
    [s1[0] - d[0], s1[1] - d[1]],
    [s0[0] - d[0], s0[1] - d[1]]
  ]
    .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const capM = `matrix(${(uA[0] * r).toFixed(3)},${(uA[1] * r).toFixed(3)},${(uB[0] * r).toFixed(3)},${(uB[1] * r).toFixed(3)},${s1[0].toFixed(2)},${s1[1].toFixed(2)})`;
  const edge = shade(color, -0.5);
  return (
    <>
      <polygon points={body} fill={color} stroke={edge} strokeWidth={0.5} strokeLinejoin="round" />
      <g transform={capM}>
        <circle cx={0} cy={0} r={1} fill={capColor} stroke={edge} strokeWidth={0.08} />
      </g>
    </>
  );
}

// Box + cylindrical motor drum on top + a side port (dark hole) ringed with the
// teal connector accent — mirrors buildBlowerMesh in the viewport.
function Blower({ color }: { color: string }) {
  const motor = "#2a3140";
  return (
    <g transform="translate(0,-3)">
      <Box x0={-1.6} x1={1.6} y0={-1.6} y1={1.6} z0={-1.6} z1={1.6} color={color} />
      <Cylinder
        c0={[0, 1.6, 0]}
        c1={[0, 2.5, 0]}
        r={0.72}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={motor}
        capColor={shade(motor, 0.32)}
      />
      <Cylinder
        c0={[1.6, 0, 0]}
        c1={[2.35, 0, 0]}
        r={0.72}
        basisA={[0, 1, 0]}
        basisB={[0, 0, 1]}
        color={shade(color, 0.18)}
        capColor="#05080c"
      />
      <g transform={faceMatrix([0, 0, 1], [0, 1, 0], [2.4, 0, 0])}>
        <circle cx={0} cy={0} r={0.95} fill="none" stroke="#5eead4" strokeWidth={0.12} />
      </g>
    </g>
  );
}

// Box + flat hood lid + a side port + a small display panel with a green LED on
// the front face — mirrors buildTerminalMesh.
function Terminal({ color }: { color: string }) {
  const hood = "#29303d";
  return (
    <g transform="translate(0,-1.4)">
      <Box x0={-1.5} x1={1.5} y0={-1.4} y1={1.3} z0={-1.5} z1={1.5} color={color} />
      <Box x0={-1.35} x1={1.35} y0={1.3} y1={1.75} z0={-1.35} z1={1.35} color={hood} />
      <Cylinder
        c0={[1.5, -0.15, 0]}
        c1={[2.25, -0.15, 0]}
        r={0.62}
        basisA={[0, 1, 0]}
        basisB={[0, 0, 1]}
        color={shade(color, 0.2)}
        capColor="#05080c"
      />
      <g transform={faceMatrix([1, 0, 0], [0, 1, 0], [0, -0.1, 1.5])}>
        <rect
          x={-0.42}
          y={-0.22}
          width={0.84}
          height={0.44}
          rx={0.06}
          fill="#0a0f18"
          stroke={shade(color, -0.3)}
          strokeWidth={0.04}
        />
        <rect x={0.12} y={-0.07} width={0.14} height={0.14} fill="#4ade80" />
      </g>
    </g>
  );
}

function Tube({ color }: { color: string }) {
  return (
    <g transform="translate(0,-3)">
      <Cylinder
        c0={[-3, 0, 0]}
        c1={[3, 0, 0]}
        r={1.05}
        basisA={[0, 1, 0]}
        basisB={[0, 0, 1]}
        color={color}
        capColor={shade(color, 0.18)}
      />
      {/* Segment seams hinting the 6ft length */}
      {[-1.5, 0, 1.5].map((x) => (
        <g key={x} transform={faceMatrix([0, 1, 0], [0, 0, 1], [x, 0, 0])}>
          <circle cx={0} cy={0} r={1.05} fill="none" stroke={shade(color, -0.3)} strokeWidth={0.08} />
        </g>
      ))}
    </g>
  );
}

// Smooth quarter-arc curved pipe (horizontal leg sweeping up to a vertical leg),
// drawn as a thick stroked centerline with a sheen + flat end caps — mirrors the
// TubeGeometry-along-arc bend in buildBendMesh.
function Bend({ color }: { color: string }) {
  const R = 2.6;
  const L = 1;
  const N = 20;
  const pts: Vec3[] = [[-L, -R, 0]];
  for (let i = 0; i <= N; i++) {
    const phi = ((-90 + 90 * (i / N)) * Math.PI) / 180;
    pts.push([R * Math.cos(phi), R * Math.sin(phi), 0]);
  }
  pts.push([R, L, 0]);
  const screen = pts.map((p) => iso(...p));
  const d = screen
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const W = 15.5;
  const capR = W / 2 / S;
  const edge = shade(color, -0.5);
  const entry = pts[0];
  const exit = pts[pts.length - 1];
  return (
    <g transform="translate(-4.5,-13.4)">
      <path d={d} fill="none" stroke={edge} strokeWidth={W + 1.4} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={W} strokeLinejoin="round" />
      <path
        d={d}
        fill="none"
        stroke={shade(color, 0.24)}
        strokeWidth={W * 0.34}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
        transform="translate(-1.6,-2.4)"
      />
      <g transform={faceMatrix([0, 0, 1], [0, 1, 0], entry)}>
        <circle cx={0} cy={0} r={capR} fill={shade(color, 0.14)} stroke={edge} strokeWidth={0.06} />
      </g>
      <g transform={faceMatrix([1, 0, 0], [0, 0, 1], exit)}>
        <circle cx={0} cy={0} r={capR} fill={shade(color, 0.14)} stroke={edge} strokeWidth={0.06} />
      </g>
    </g>
  );
}

export function PartThumbnail({ type, color }: { type: string; color: string }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 64 56"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      {type === "blower" && <Blower color={color} />}
      {type === "terminal" && <Terminal color={color} />}
      {type === "tube" && <Tube color={color} />}
      {type === "bend" && <Bend color={color} />}
    </svg>
  );
}
