import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  buildBendMesh,
  buildBlowerMesh,
  buildPedestalMesh,
  buildObstacleMesh,
  buildTerminalMesh,
  buildTubeMesh
} from "@/renderer/design-meshes";
import {
  beginViewportDrag,
  clickCellForTool,
  createViewportDragState,
  endViewportDrag,
  isViewportClick,
  landingCellForObject,
  moveViewportDrag,
  partIdForObject
} from "@/renderer/interaction";
import {
  buildFloorShadow,
  buildHeightMarker,
  HEIGHT_MARKER_FEET,
  buildFloorSeparator,
  buildRoomCeiling,
  buildRoomFloor,
  buildRoomWalls,
  buildGround,
  buildLandingCellHighlight,
  buildPlenumBand,
  buildPortGlow
} from "@/renderer/scene-affordances";
import {
  cellCenter,
  clearGroup,
  dirToQuat,
  disposeObject,
  updateLineResolutions,
  VP
} from "@/renderer/three-utils";
import { type PlenumBand, type RoomRect } from "@/domain/floors";
import { STANDARD_VIEWS, type CameraView } from "@/renderer/camera-views";
import type { FloorShadow, HeightMarker } from "@/domain/renderer-affordances";
import { type PortMarker } from "@/domain/renderer-affordances";
import { BUILD_AREA } from "@/domain/sparse-grid";
import type { BuildArea, Ghost, Scene, ToolId, Vec3 } from "@/types";
import "@/renderer/Viewport.css";

/**
 * The React viewport: it owns the WebGL renderer, the scene graph, and the
 * effects that keep each scene group in step with props.
 *
 * The meshes it assembles, the pure interaction maths and the Three.js plumbing
 * live in sibling modules. What is left here is the lifecycle — creation,
 * synchronisation and teardown — which is the part that cannot be a pure
 * function and the part worth reading on its own.
 */

/**
 * How the camera is framed on open, and what "Reset view" returns to.
 *
 * One constant because these used to be two: the app opened at distance 38 and
 * reset to 32, so resetting the view moved the camera somewhere it had never
 * been and could not be returned to (issue #10).
 */
export const DEFAULT_CAMERA_FRAMING = {
  yaw: 0.55,
  pitch: 0.55,
  distance: 38,
  target: [0, 0.5, 1] as const
};

/** What the zoom limit was before it scaled, and the floor it keeps. */
const DEFAULT_MAX_CAMERA_DISTANCE = 140;

/** How close the camera may be pushed, wherever the distance is being set. */
const MIN_CAMERA_DISTANCE = 8;

/** The camera's vertical field of view. Also what marker sizing is derived from. */
const CAMERA_FOV_DEG = 38;

/**
 * The on-screen bounds a height marker is kept inside.
 *
 * Below the minimum there is nothing left to read at all, and drawing it only
 * adds noise to a view that has zoomed past the detail it belongs to. Above
 * the maximum it starts covering the part it is describing — the failure that
 * screen-space sizing had at every zoom level.
 *
 * The minimum used to be a legibility floor: 11 px, enough to read at the
 * distance the default room opens at, which in turn set how large a marker had
 * to be in the world. The client gave that up to get smaller markers — "if
 * users can't read it, they will zoom in" — so it now only decides when a
 * marker has shrunk to a smudge worth dropping, well past the opening view.
 */
const MARKER_MIN_PIXELS = 6;
const MARKER_MAX_PIXELS = 42;

/**
 * What the camera distances are derived from. The footprint alone: height
 * changes what the camera looks at, not how far back it has to stand, and
 * taking the whole build area would tie these to a value they never read.
 */
type CameraFootprint = { width: number; depth: number };

/**
 * How far the camera may pull back, and how far it can see.
 *
 * A fixed limit cannot serve both ends of the build-area range: 140 frames a
 * 60 ft room with room to spare and leaves a 300 ft one impossible to see
 * whole. The distance needed to fit a span across a 38 degree vertical field
 * is `span / (2 * tan(19deg))`, about 1.45x — applied to the footprint's
 * diagonal, with headroom, and never below what small designs already had.
 */
export function maxCameraDistance(area: CameraFootprint): number {
  return Math.max(DEFAULT_MAX_CAMERA_DISTANCE, Math.hypot(area.width, area.depth) * 1.6);
}

/**
 * The far plane. Anything beyond it is clipped, so it has to clear the camera
 * at full pull-back plus the far side of the volume it is looking at — a fixed
 * 200 quietly cut the back off any design bigger than the default.
 */
export function cameraFarPlane(area: BuildArea): number {
  return maxCameraDistance(area) + Math.hypot(area.width, area.depth) + area.height;
}

/**
 * Where the camera sits when a design opens: far enough back that the whole
 * room and a margin of the ground around it are in frame.
 *
 * The same 1.6 x diagonal that `maxCameraDistance` uses to see a footprint
 * whole, applied to the room's. The old rule scaled the wall-less era's 38,
 * which now opens *inside* the room — the walls fill the frame and nothing
 * says where you are. Opening on the room as an object in the build area is
 * the mental model the room exists to teach.
 */
/** World feet spanned by one screen pixel at `distance`, for this camera. */
function feetPerPixel(distance: number, viewportHeight: number): number {
  const halfFov = (CAMERA_FOV_DEG * Math.PI) / 360;
  return (2 * distance * Math.tan(halfFov)) / Math.max(1, viewportHeight);
}

/**
 * How tall a height marker should stand, and whether it is worth drawing.
 *
 * World-scaled through the range that matters, so a marker shrinks with the
 * part it labels rather than growing to cover it. Clamped at the near end so
 * it cannot fill the screen when the camera is right on top of a part, and
 * dropped at the far end once there is nothing left of it to read — at which
 * point the elevation is still on screen beside the armed tool, so nothing is
 * lost. Between those ends a marker may well be too small to read from where
 * the camera happens to sit; the answer to that is the scroll wheel.
 */
export function heightMarkerScale(
  distance: number,
  viewportHeight: number
): { feet: number; visible: boolean } {
  const perPixel = feetPerPixel(distance, viewportHeight);
  const feet = Math.min(HEIGHT_MARKER_FEET, MARKER_MAX_PIXELS * perPixel);
  return { feet, visible: feet / perPixel >= MARKER_MIN_PIXELS };
}

export function openingCameraDistance(area: CameraFootprint): number {
  const proportional = Math.hypot(area.width, area.depth) * 1.6;
  return Math.max(MIN_CAMERA_DISTANCE, Math.min(maxCameraDistance(BUILD_AREA), proportional));
}

/**
 * One rendered view of the design, as JPEG bytes.
 *
 * JPEG rather than PNG because these are photographs of a shaded scene, where
 * the format costs a fraction of the bytes for no visible difference, and
 * because `pdf-lib` embeds it directly.
 */
export type ViewportShot = { label: string; jpeg: Uint8Array };

/** The pixel size each shot is rendered at, independent of the window. */
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 800;
const SHOT_QUALITY = 0.85;

/**
 * How far back a shot stands off the design.
 *
 * Fitting a bounding sphere of radius R into a vertical field of view f needs
 * `R / sin(f / 2)`; the rest is margin, so nothing touches the edge of the
 * picture. Shots frame the design rather than reusing wherever the visitor has
 * the camera — the document should show the whole system however the screen
 * happens to be pointed when the PDF is asked for.
 */
const SHOT_FIT_MARGIN = 1.15;

type ViewportState = {
  renderer?: THREE.WebGLRenderer;
  scene3?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  cam?: { yaw: number; pitch: number; distance: number; target: THREE.Vector3 };
  applyCamera?: () => void;
  partsGroup?: THREE.Group;
  obstaclesGroup?: THREE.Group;
  ghostGroup?: THREE.Group;
  overlayGroup?: THREE.Group;
  planeGroup?: THREE.Group;
  portsGroup?: THREE.Group;
  groundGroup?: THREE.Group;
  hoverPlane?: THREE.Mesh;
  requestRender?: () => void;
  /** How far the camera may pull back, derived from the current build area. */
  maxDistance?: number;
  /** Re-sizes every height marker for the current camera distance. */
  syncMarkers?: () => void;
  /** Renders the design from each standard angle. See `captureRef`. */
  capture?: () => ViewportShot[];
  /** The room's footprint at ground level, which every shot is framed to include. */
  roomBounds?: THREE.Box3 | null;
  cleanup?: () => void;
};

export type ViewportPlaceTarget = {
  partId?: string;
};

function assertNever(value: never): never {
  throw new Error(`Viewport received an unsupported variant: ${JSON.stringify(value)}`);
}

export type ViewportProps = {
  scene: Scene;
  buildArea?: BuildArea;
  ghost: Ghost | null;
  tool: ToolId;
  onPlace?: (cell: Vec3, target?: ViewportPlaceTarget) => void;
  onHover?: (cell: Vec3) => void;
  landingCells?: Vec3[];
  activeElevation?: number;
  portMarkers?: PortMarker[];
  /** Y level of a two-floor design's separator slab, or null for one floor. */
  separatorY?: number | null;
  /** The Y the room's own ceiling sits at: the top of its walls. */
  roomTop?: number | null;
  /** Which floor the placement plane is on; the other floor's grid dims. */
  activeFloor?: 1 | 2 | null;
  /** The plenum's Y range on each floor; empty when the design has none. */
  plenumBands?: PlenumBand[];
  /** Heights to label in the scene; empty when markers are not being shown. */
  heightMarkers?: HeightMarker[];
  /** The elevation the armed tool would place at, labelled beside the ghost. */
  ghostHeight?: number | null;
  /**
   * Where parts sit over the floors beneath them — the armed one, and every
   * placed one at elevation. Empty when nothing is above a floor.
   */
  floorShadows?: FloorShadow[];
  /** The room's footprint; its floor patch, walls, slab and plenum span this. */
  roomRect?: RoomRect | null;
  /** The room's walls as cell boxes, derived beside the rect in floors.ts. */
  roomWalls?: Array<{ min: Vec3; max: Vec3 }>;
  /**
   * The Y the camera orbits around — the active floor's base. Selecting a
   * floor has to bring the camera with it: a plane 31 ft up is edge-on or
   * behind a camera still aimed at the ground, and clicks at it land far
   * outside the build area.
   */
  focusY?: number;
  /**
   * Filled in with a function that renders the design from every standard
   * angle and hands back the pictures, for the exported PDF.
   *
   * A ref rather than a callback prop because this is something the viewport
   * can be *asked to do*, not something it reports: nothing about the scene has
   * changed when it is called, and the caller wants an answer back.
   */
  captureRef?: { current: (() => ViewportShot[]) | null };
  /**
   * A named angle to point the camera at, or null for the opening framing.
   * A fresh object each time one is chosen, so picking the same view twice
   * re-applies it rather than silently doing nothing.
   */
  view?: CameraView | null;
};

export function Viewport({
  scene,
  buildArea = BUILD_AREA,
  ghost,
  tool,
  onPlace,
  onHover,
  landingCells = [],
  activeElevation = 0,
  portMarkers = [],
  separatorY = null,
  activeFloor = null,
  roomTop = null,
  plenumBands = [],
  heightMarkers = [],
  ghostHeight = null,
  floorShadows = [],
  roomRect = null,
  roomWalls = [],
  focusY = 0,
  view = null,
  captureRef
}: ViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<ViewportState>({});
  const toolRef = useRef<ToolId>(tool);
  const callbacksRef = useRef<Pick<ViewportProps, "onPlace" | "onHover">>({ onPlace, onHover });

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.cam || !s.applyCamera) return;
    s.cam.target.y = focusY + DEFAULT_CAMERA_FRAMING.target[1];
    s.applyCamera();
  }, [focusY]);

  useEffect(() => {
    callbacksRef.current = { onPlace, onHover };
  }, [onPlace, onHover]);

  // Published after the renderer exists, and taken back when it stops: a stale
  // capture would draw into a canvas that is no longer on the page.
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => stateRef.current.capture?.() ?? [];
    return () => {
      captureRef.current = null;
    };
  }, [captureRef]);

  // Snapping to a view turns the camera without moving it in or out: the zoom
  // is where the visitor put it, and a preset that reframed as well would
  // throw that away every time they looked from another side.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.cam || !s.applyCamera) return;
    s.cam.yaw = view ? view.yaw : DEFAULT_CAMERA_FRAMING.yaw;
    s.cam.pitch = view ? view.pitch : DEFAULT_CAMERA_FRAMING.pitch;
    s.applyCamera();
    s.syncMarkers?.();
  }, [view]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(VP.bg, 1);
    mount.appendChild(renderer.domElement);

    const scene3 = new THREE.Scene();

    // Near/far are placeholders: the build-area effect sizes the far plane to
    // the volume actually being drawn, and runs on first render too. The near
    // plane is 0.5 rather than the customary 0.1 because depth precision is
    // spent as far/near — with the far plane spanning the whole build area, a
    // 0.1 near left too little resolution to keep coplanar ground layers
    // apart. The camera can come no closer than 8 ft, so nothing is clipped.
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, w / h, 0.5, 200);
    const cam = {
      yaw: DEFAULT_CAMERA_FRAMING.yaw,
      pitch: DEFAULT_CAMERA_FRAMING.pitch,
      distance: DEFAULT_CAMERA_FRAMING.distance,
      target: new THREE.Vector3(...DEFAULT_CAMERA_FRAMING.target)
    };
    /**
     * Draw one frame, coalescing every invalidation raised before it runs.
     *
     * Nothing in this scene animates, so the perpetual rAF loop this replaces
     * redrew an identical image forever, for the whole time the app was open
     * (issue #14). In exchange, anything that changes what is on screen now has
     * to say so. That includes the paths that *remove* something and return
     * early — clearing the ghost group when there is no ghost changes the
     * picture exactly as much as adding to it does.
     */
    let raf = 0;
    const requestRender = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderer.render(scene3, camera);
      });
    };

    /**
     * Height markers are world-scaled, so their on-screen size changes with
     * every zoom. Re-applied here rather than per frame: the camera is the
     * only thing that moves them, and this runs exactly when it does.
     */
    function syncMarkers() {
      const size = renderer.getSize(new THREE.Vector2());
      const { feet, visible } = heightMarkerScale(cam.distance, size.y);
      const apply = (node: THREE.Object3D) => {
        const sprite = node as THREE.Sprite;
        if (!sprite.isSprite) return;
        sprite.visible = visible;
        const aspect = (sprite.userData.markerAspect as number | undefined) ?? 1;
        sprite.scale.set(aspect * feet, feet, 1);
      };
      planeGroup.traverse(apply);
      ghostGroup.traverse(apply);
    }

    /** Put the camera where `cam` says, without asking for a frame. */
    function positionCamera() {
      const r = cam.distance;
      camera.position.set(
        cam.target.x + r * Math.cos(cam.pitch) * Math.sin(cam.yaw),
        cam.target.y + r * Math.sin(cam.pitch),
        cam.target.z + r * Math.cos(cam.pitch) * Math.cos(cam.yaw)
      );
      camera.lookAt(cam.target);
    }

    function applyCamera() {
      positionCamera();
      requestRender();
    }
    applyCamera();

    scene3.add(new THREE.AmbientLight(0x9eb4d4, 0.55));
    const key = new THREE.DirectionalLight(0xfff5e0, 0.7);
    key.position.set(8, 16, 6);
    scene3.add(key);
    const rim = new THREE.DirectionalLight(0x6ae0d0, 0.35);
    rim.position.set(-10, 8, -6);
    scene3.add(rim);

    // No ground here: the build-area effect below owns it and runs on first
    // render too. Building it in both places made this effect depend on
    // buildArea while declaring no dependencies, an invariant held by hand.

    const partsGroup = new THREE.Group();
    scene3.add(partsGroup);
    const obstaclesGroup = new THREE.Group();
    scene3.add(obstaclesGroup);
    const ghostGroup = new THREE.Group();
    scene3.add(ghostGroup);
    const overlayGroup = new THREE.Group();
    scene3.add(overlayGroup);
    const planeGroup = new THREE.Group();
    scene3.add(planeGroup);
    const portsGroup = new THREE.Group();
    scene3.add(portsGroup);

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const hoverPlane = new THREE.Mesh(
      // Comfortably past the largest legal footprint. Sized to match it exactly,
      // a pointer at the far edge would land on the plane's own boundary.
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hoverPlane.rotation.x = -Math.PI / 2;
    scene3.add(hoverPlane);

    /**
     * Render the design from each standard angle and hand back the pictures.
     *
     * Everything transient is hidden first — the ghost, the port glows, the
     * landing highlights and shadows, the height markers. What is on screen
     * depends on which tool happens to be armed when the visitor asks for a
     * PDF, and a document whose pictures change with that would be a poor
     * record of the design.
     *
     * `toDataURL` is read in the same synchronous turn as the render it
     * follows: the drawing buffer is not preserved between frames, so anything
     * that let the browser present first would read back a cleared canvas.
     */
    function capture(): ViewportShot[] {
      const transient = [ghostGroup, portsGroup, overlayGroup, planeGroup];
      const wasVisible = transient.map((group) => group.visible);
      const size = renderer.getSize(new THREE.Vector2());
      const before = {
        yaw: cam.yaw,
        pitch: cam.pitch,
        distance: cam.distance,
        target: cam.target.clone(),
        aspect: camera.aspect
      };

      // Frame the design and the room it is in, ignoring the ground, which
      // spans the whole 300 ft build area and would shrink any room to a speck
      // in the middle of it. The room is included so the five views are
      // comparable — framing the parts alone gives every design a different
      // scale, and a design with one blower an extreme close-up of it.
      const bounds = new THREE.Box3();
      bounds.expandByObject(partsGroup);
      bounds.expandByObject(obstaclesGroup);
      const room = stateRef.current.roomBounds;
      if (room) bounds.union(room);
      const sphere = bounds.isEmpty() ? null : bounds.getBoundingSphere(new THREE.Sphere());

      try {
        for (const group of transient) group.visible = false;
        renderer.setSize(SHOT_WIDTH, SHOT_HEIGHT, false);
        updateLineResolutions(scene3, SHOT_WIDTH, SHOT_HEIGHT);
        camera.aspect = SHOT_WIDTH / SHOT_HEIGHT;
        if (sphere) {
          cam.target.copy(sphere.center);
          cam.distance = Math.max(
            MIN_CAMERA_DISTANCE,
            (sphere.radius / Math.sin((CAMERA_FOV_DEG * Math.PI) / 360)) * SHOT_FIT_MARGIN
          );
        }

        return STANDARD_VIEWS.map((standardView) => {
          cam.yaw = standardView.yaw;
          cam.pitch = standardView.pitch;
          positionCamera();
          camera.updateProjectionMatrix();
          renderer.render(scene3, camera);
          return {
            label: standardView.label,
            jpeg: jpegBytes(renderer.domElement.toDataURL("image/jpeg", SHOT_QUALITY))
          };
        });
      } finally {
        transient.forEach((group, i) => (group.visible = wasVisible[i]));
        renderer.setSize(size.x, size.y, false);
        updateLineResolutions(scene3, size.x, size.y);
        camera.aspect = before.aspect;
        camera.updateProjectionMatrix();
        cam.yaw = before.yaw;
        cam.pitch = before.pitch;
        cam.distance = before.distance;
        cam.target.copy(before.target);
        applyCamera();
      }
    }

    stateRef.current = {
      renderer,
      scene3,
      camera,
      cam,
      applyCamera,
      partsGroup,
      obstaclesGroup,
      ghostGroup,
      overlayGroup,
      planeGroup,
      portsGroup,
      hoverPlane,
      requestRender,
      syncMarkers,
      capture
    };

    let drag = createViewportDragState();
    let lastHoverCell: Vec3 | null = null;
    // Right-drag pans the camera rig: we translate cam.target (and therefore the
    // camera with it) along the camera's screen-space right/up axes.
    let panning = false;
    let panX = 0;
    let panY = 0;
    const panRight = new THREE.Vector3();
    const panUp = new THREE.Vector3();

    const onDown = (e: MouseEvent) => {
      if (e.button === 2) {
        panning = true;
        panX = e.clientX;
        panY = e.clientY;
        return;
      }
      if (e.button !== 0) return;
      drag = beginViewportDrag(drag, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (panning && e.buttons & 2) {
        const dx = e.clientX - panX;
        const dy = e.clientY - panY;
        panX = e.clientX;
        panY = e.clientY;
        // World units per screen pixel at the target plane, so the scene tracks
        // the cursor 1:1 and panning feels consistent at any zoom level.
        const worldPerPixel =
          (2 * cam.distance * Math.tan((camera.fov * Math.PI) / 180 / 2)) / rect.height;
        camera.updateMatrixWorld();
        camera.matrixWorld.extractBasis(panRight, panUp, new THREE.Vector3());
        cam.target.addScaledVector(panRight, -dx * worldPerPixel);
        cam.target.addScaledVector(panUp, dy * worldPerPixel);
        applyCamera();
        return;
      }
      const moved = moveViewportDrag(drag, { x: e.clientX, y: e.clientY }, e.buttons);
      drag = moved.state;
      if (moved.delta) {
        cam.yaw -= moved.delta.x * 0.008;
        cam.pitch = Math.max(0.12, Math.min(1.45, cam.pitch + moved.delta.y * 0.005));
        applyCamera();
      }
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const cell = pickCell(ray);
      if (cell) {
        if (
          !lastHoverCell ||
          cell[0] !== lastHoverCell[0] ||
          cell[1] !== lastHoverCell[1] ||
          cell[2] !== lastHoverCell[2]
        ) {
          lastHoverCell = cell;
          callbacksRef.current.onHover?.(cell);
        }
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 2) {
        panning = false;
        return;
      }
      if (drag.active && isViewportClick(drag, { x: e.clientX, y: e.clientY })) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(mouse, camera);
        const pickedPart = ray.intersectObjects(partsGroup.children, true)[0];
        const partId = pickedPart ? partIdForObject(pickedPart.object) : undefined;
        const cell = clickCellForTool(toolRef.current, pickCell(ray), pickedPart?.point);
        if (cell) {
          callbacksRef.current.onPlace?.(cell, partId ? { partId } : undefined);
        }
      }
      drag = endViewportDrag(drag);
    };

    function pickCell(rayInstance: THREE.Raycaster): Vec3 | null {
      const landingHit = rayInstance.intersectObjects(overlayGroup.children, true)[0];
      if (landingHit) {
        const landing = landingCellForObject(landingHit.object);
        if (landing) return landing;
      }
      const planeHit = rayInstance.intersectObject(hoverPlane)[0];
      if (planeHit) {
        return [
          Math.floor(planeHit.point.x),
          Math.floor(hoverPlane.position.y),
          Math.floor(planeHit.point.z)
        ];
      }
      return null;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // How far back is enough depends on the design: a 60 ft room needs ~140,
      // and a 300 ft one cannot be seen whole from there. `maxCameraDistance`
      // scales the limit to the build area rather than capping every design at
      // what the smallest needs, which is what stopped a large one being framed.
      const limit = stateRef.current.maxDistance ?? DEFAULT_MAX_CAMERA_DISTANCE;
      cam.distance = Math.max(
        MIN_CAMERA_DISTANCE,
        Math.min(limit, cam.distance * (1 + e.deltaY * 0.0015))
      );
      applyCamera();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenu);

    const onResize = () => {
      const W = mount.clientWidth;
      const H = mount.clientHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      updateLineResolutions(scene3, W, H);
      requestRender();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    stateRef.current.cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContextMenu);
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      // Everything we built hangs off scene3 — including whichever ground group
      // the build-area effect installed most recently — so one traversal frees it
      // all. StrictMode remounts this effect in dev, so it runs more than once.
      disposeObject(scene3);
      renderer.dispose();
    };
    return () => stateRef.current.cleanup?.();
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.partsGroup || !s.obstaclesGroup) return;
    clearGroup(s.partsGroup);
    clearGroup(s.obstaclesGroup);
    for (const o of scene.obstacles ?? []) {
      s.obstaclesGroup.add(buildObstacleMesh(o.min, o.max, { penetrable: o.penetrable }));
    }
    for (const p of scene.parts ?? []) {
      let mesh: THREE.Group | null = null;
      if (p.type === "blower") {
        mesh = buildBlowerMesh();
        const c = cellCenter(p.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(p.dir));
        // The mast stays upright while the blower turns, so it is its own
        // unrotated mesh sharing the blower's id — clicking it erases the unit.
        const pedestal = p.pedestalFeet ? buildPedestalMesh(p.pedestalFeet) : null;
        if (pedestal) {
          pedestal.position.set(c[0], c[1], c[2]);
          pedestal.userData.partId = p.id;
          s.partsGroup.add(pedestal);
        }
      } else if (p.type === "terminal") {
        mesh = buildTerminalMesh();
        const c = cellCenter(p.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(p.axis));
      } else if (p.type === "tube") {
        mesh = buildTubeMesh(p.from, p.to);
      } else if (p.type === "bend") {
        mesh = buildBendMesh(p);
      } else {
        assertNever(p);
      }
      if (mesh) {
        mesh.userData.partId = p.id;
        s.partsGroup.add(mesh);
      }
    }
    if (s.renderer) {
      const size = s.renderer.getSize(new THREE.Vector2());
      updateLineResolutions(s.obstaclesGroup, size.x, size.y);
    }
    s.requestRender?.();
  }, [scene]);

  // Builds the ground plane + grid, and rebuilds it whenever the configured build
  // area changes. This also covers the initial build: effects run after the first
  // render too, in declaration order, so scene3 exists by the time this runs.
  const { width: areaWidth, depth: areaDepth, height: areaHeight } = buildArea;

  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene3) return;
    if (s.groundGroup) {
      s.scene3.remove(s.groundGroup);
      disposeObject(s.groundGroup);
    }
    const area = { width: areaWidth, depth: areaDepth, height: areaHeight };
    const ground = buildGround(area, activeFloor === 2);
    if (roomRect) {
      ground.add(buildRoomFloor(roomRect, activeFloor === 2));
      ground.add(buildRoomWalls(roomWalls));
      if (roomTop !== null) ground.add(buildRoomCeiling(roomRect, roomTop));
      if (separatorY !== null) {
        ground.add(buildFloorSeparator(roomRect, separatorY, activeFloor === 1));
      }
      for (const band of plenumBands) {
        ground.add(
          buildPlenumBand(roomRect, band, activeFloor !== null && activeFloor !== band.floor)
        );
      }
    }
    s.scene3.add(ground);
    s.groundGroup = ground;
    s.roomBounds = roomRect
      ? new THREE.Box3(
          new THREE.Vector3(roomRect.xMin, 0, roomRect.zMin),
          new THREE.Vector3(roomRect.xMax, 0, roomRect.zMax)
        )
      : null;

    // The camera's reach belongs to the volume it is looking at, so it is set
    // here rather than where the camera is built — that effect deliberately
    // takes no build-area dependency.
    s.maxDistance = maxCameraDistance(area);
    if (s.camera) {
      s.camera.far = cameraFarPlane(area);
      s.camera.updateProjectionMatrix();
    }
    // A design smaller than the last one can leave the camera parked beyond its
    // new limit, showing empty space it can no longer zoom back from.
    if (s.cam && s.cam.distance > s.maxDistance) {
      s.cam.distance = s.maxDistance;
      s.applyCamera?.();
    }
    s.requestRender?.();
  }, [
    areaWidth,
    areaDepth,
    areaHeight,
    separatorY,
    roomTop,
    activeFloor,
    plenumBands,
    roomRect,
    roomWalls
  ]);

  // Frame the camera on the room: on first render, and again whenever a new
  // design brings a different one — the build area itself never changes size.
  // Deliberately not keyed to height or floor: switching floors moves the
  // target, and yanking the zoom with it would throw away wherever the
  // visitor had scrolled to.
  const roomWidth = roomRect ? roomRect.xMax - roomRect.xMin : areaWidth;
  const roomDepth = roomRect ? roomRect.zMax - roomRect.zMin : areaDepth;
  useEffect(() => {
    const s = stateRef.current;
    if (!s.cam) return;
    s.cam.distance = openingCameraDistance({ width: roomWidth, depth: roomDepth });
    s.applyCamera?.();
  }, [roomWidth, roomDepth]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.ghostGroup) return;
    // Clearing the group is itself a visible change, so the render request below
    // is outside the `if` — a ghost that has just been dismissed must be
    // repainted away.
    clearGroup(s.ghostGroup);
    let mesh: THREE.Group | null = null;
    if (ghost) {
      if (ghost.type === "blower") {
        mesh = buildBlowerMesh({ ghost: true });
        const c = cellCenter(ghost.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(ghost.dir));
        // Its own mesh for the same reason as a placed one: the mast is
        // vertical whichever way the blower is turned.
        const pedestal = ghost.pedestalFeet
          ? buildPedestalMesh(ghost.pedestalFeet, { ghost: true })
          : null;
        if (pedestal) {
          pedestal.position.set(c[0], c[1], c[2]);
          s.ghostGroup.add(pedestal);
        }
      } else if (ghost.type === "terminal") {
        mesh = buildTerminalMesh({ ghost: true });
        const c = cellCenter(ghost.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(ghost.axis));
      } else if (ghost.type === "tube") {
        mesh = buildTubeMesh(ghost.from, ghost.to, {
          ghost: true,
          blocked: ghost.blocked,
          accent: !ghost.blocked
        });
      } else if (ghost.type === "bend") {
        mesh = buildBendMesh(ghost, { ghost: true, accent: true });
      } else if (ghost.type === "obstacle") {
        mesh = buildObstacleMesh(ghost.min, ghost.max, {
          ghost: true,
          penetrable: ghost.penetrable
        });
      } else {
        assertNever(ghost);
      }
      if (mesh) s.ghostGroup.add(mesh);
      // The ghost's own marker, in the accent colour so the height being
      // chosen stands out from the heights already placed around it.
      if (mesh && ghostHeight !== null) {
        const box = new THREE.Box3().setFromObject(mesh);
        const marker = buildHeightMarker(
          [box.max.x + 0.45, box.max.y + 0.55, box.max.z + 0.45],
          ghostHeight,
          { accent: true }
        );
        if (marker) s.ghostGroup.add(marker);
      }
      s.syncMarkers?.();
      if (s.renderer) {
        const size = s.renderer.getSize(new THREE.Vector2());
        updateLineResolutions(s.ghostGroup, size.x, size.y);
      }
    }
    s.requestRender?.();
  }, [ghost, ghostHeight]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.overlayGroup) return;
    clearGroup(s.overlayGroup);
    for (const cell of landingCells) {
      s.overlayGroup.add(buildLandingCellHighlight(cell, tool));
    }
    for (const shadow of floorShadows) {
      s.overlayGroup.add(buildFloorShadow(shadow.cells, shadow.y, { live: shadow.live }));
    }
    s.requestRender?.();
  }, [landingCells, tool, floorShadows]);

  // Height markers, and the hover plane the pointer casts onto. The plane a
  // translucent sheet used to draw at this elevation is gone: it showed where
  // the placement height was without ever saying what it was, and a label
  // beside each thing answers the question the sheet only gestured at.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.planeGroup || !s.hoverPlane) return;
    clearGroup(s.planeGroup);
    s.hoverPlane.position.y = activeElevation;
    for (const marker of heightMarkers) {
      const sprite = buildHeightMarker(marker.at, marker.feet, { label: marker.label });
      if (sprite) s.planeGroup.add(sprite);
    }
    // A sprite is built at its full world size; the camera decides what that
    // should be right now, so size it before it is ever drawn.
    s.syncMarkers?.();
    s.requestRender?.();
  }, [activeElevation, heightMarkers]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.portsGroup) return;
    const group = s.portsGroup;
    clearGroup(group);
    for (const marker of portMarkers) {
      group.add(buildPortGlow(marker));
    }
    s.requestRender?.();
  }, [portMarkers]);

  return (
    <div
      ref={mountRef}
      className={`viewport-canvas${tool && tool !== "cursor" ? " viewport-canvas--placing" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/** A `data:` URL's payload as bytes, which is what `pdf-lib` embeds. */
function jpegBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
