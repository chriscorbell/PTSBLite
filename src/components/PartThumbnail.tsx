import "@/components/PartThumbnail.css";

// Isometric, shaded part illustrations for the Build drawer. Each part is drawn
// from simple 3D primitives (cylinders, arcs) projected through a shared iso
// transform, then face-mounted details (door slats, lights, ports) are placed
// with a per-face affine matrix so they sit on the correct plane.
//
// Every Kel2020 part is a cylinder, which is why there is no box primitive here.

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
  const full =
    c.length === 3
      ? c
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : c;
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

// Affine matrix mapping a 2D (u, v) face plane to screen, given the two 3D axis
// directions of the plane and the 3D point that maps to local origin.
function faceMatrix(uDir: Vec3, vDir: Vec3, originXYZ: Vec3): string {
  const u = projDir(...uDir);
  const v = projDir(...vDir);
  const [ox, oy] = iso(...originXYZ);
  return `matrix(${u[0].toFixed(3)},${u[1].toFixed(3)},${v[0].toFixed(3)},${v[1].toFixed(3)},${ox.toFixed(2)},${oy.toFixed(2)})`;
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

/** The brushed metal the collars and fittings are made of (VP.blowerEdge). */
const COLLAR = "#7a8598";

// The Kel2020 power unit: a drum with a stepped neck, a metal collar where the
// tube leaves it and a green power light on its side — mirrors buildBlowerMesh
// in the viewport. Drawn standing with its port up, which is how a blower is
// placed before anything turns it and how the real unit sits on the floor.
// The unit itself is drawn `y` feet up its own axis so the pedestal variant can
// raise it without a second copy of the geometry.
function BlowerBody({ color, y = 0 }: { color: string; y?: number }) {
  return (
    <>
      <Cylinder
        c0={[0, y - 1.6, 0]}
        c1={[0, y + 0.3, 0]}
        r={1.44}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={color}
        capColor={shade(color, 0.2)}
      />
      <Cylinder
        c0={[0, y + 0.3, 0]}
        c1={[0, y + 1.25, 0]}
        r={1.05}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={shade(color, 0.08)}
        capColor={shade(color, 0.26)}
      />
      <Cylinder
        c0={[0, y + 1.25, 0]}
        c1={[0, y + 1.6, 0]}
        r={1.0}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={COLLAR}
        capColor="#05080c"
      />
      <g transform={faceMatrix([1, 0, 0], [0, 0, 1], [0, y + 1.68, 0])}>
        <circle cx={0} cy={0} r={0.95} fill="none" stroke="#5eead4" strokeWidth={0.12} />
      </g>
      <g transform={faceMatrix([1, 0, 0], [0, 1, 0], [0, y + 0.05, 1.44])}>
        <circle cx={0} cy={0} r={0.2} fill="#4ade80" />
      </g>
    </>
  );
}

function Blower({ color }: { color: string }) {
  return (
    <g transform="translate(0,-3)">
      <BlowerBody color={color} />
    </g>
  );
}

// The same unit standing on its mast — what the drawer's fifth card shows, and
// what the viewport draws once the blower is raised off the floor. The mast is
// tube-coloured because that is what it is made of, even though it is counted
// in no BOM row (see domain/pedestal.ts).
function PedestalBlower({ color }: { color: string }) {
  const tube = "#9AA4B4";
  const lift = 2.5;
  return (
    <g transform="translate(0,1.5)">
      <Cylinder
        c0={[0, -3.6, 0]}
        c1={[0, -3.2, 0]}
        r={1.25}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={shade(tube, -0.3)}
        capColor={shade(tube, -0.12)}
      />
      <Cylinder
        c0={[0, -3.2, 0]}
        c1={[0, lift - 1.5, 0]}
        r={0.5}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={tube}
        capColor={shade(tube, 0.2)}
      />
      <BlowerBody color={color} y={lift} />
    </g>
  );
}

// The Kel2020 terminal: a clear barrel ribbed along its length between two
// brushed collars, the slatted door and its green wordmark across the front,
// the send button on the lower collar and the port on top — mirrors
// buildTerminalMesh, including its height: a terminal is 1 ft square and 2 ft
// tall (ADR-0021).
function Terminal({ color }: { color: string }) {
  const glass = "#d7e3f0";
  const door = "#a9a390";
  return (
    <g transform="translate(0,-0.4)">
      <Cylinder
        c0={[0, -2.9, 0]}
        c1={[0, -2.26, 0]}
        r={1.15}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={color}
        capColor={shade(color, 0.22)}
      />
      <g opacity={0.5}>
        <Cylinder
          c0={[0, -2.26, 0]}
          c1={[0, 2.26, 0]}
          r={1.09}
          basisA={[1, 0, 0]}
          basisB={[0, 0, 1]}
          color={glass}
          capColor={shade(glass, 0.15)}
        />
      </g>
      {[-1.3, -0.1, 1.1].map((y) => (
        <g key={y} transform={faceMatrix([1, 0, 0], [0, 0, 1], [0, y, 0])}>
          <circle cx={0} cy={0} r={1.09} fill="none" stroke={COLLAR} strokeWidth={0.06} />
        </g>
      ))}
      <Cylinder
        c0={[0, 2.26, 0]}
        c1={[0, 2.9, 0]}
        r={1.15}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={color}
        capColor={shade(color, 0.22)}
      />
      <Cylinder
        c0={[0, 2.9, 0]}
        c1={[0, 3.5, 0]}
        r={0.62}
        basisA={[1, 0, 0]}
        basisB={[0, 0, 1]}
        color={shade(color, 0.2)}
        capColor="#05080c"
      />
      <g transform={faceMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1.13])}>
        {[-1.85, -0.95, 0.85, 1.75].map((y) => (
          <rect key={y} x={-0.8} y={y - 0.08} width={1.6} height={0.16} fill={door} />
        ))}
        <rect x={-0.75} y={-0.28} width={1.5} height={0.34} fill="#4ade80" />
        <rect x={-0.16} y={-2.62} width={0.32} height={0.32} rx={0.16} fill="#4ade80" />
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
          <circle
            cx={0}
            cy={0}
            r={1.05}
            fill="none"
            stroke={shade(color, -0.3)}
            strokeWidth={0.08}
          />
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
  const d = screen.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
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

export function PartThumbnail({
  type,
  color,
  pedestal = false
}: {
  type: string;
  color: string;
  /** Draw a blower standing on its mast. The catalog calls a pedestal blower a
   * blower, which is right about the part and wrong about the picture. */
  pedestal?: boolean;
}) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 64 56"
      preserveAspectRatio="xMidYMid meet"
      className="part-thumbnail"
    >
      {type === "blower" &&
        (pedestal ? <PedestalBlower color={color} /> : <Blower color={color} />)}
      {type === "terminal" && <Terminal color={color} />}
      {type === "tube" && <Tube color={color} />}
      {type === "bend" && <Bend color={color} />}
    </svg>
  );
}
