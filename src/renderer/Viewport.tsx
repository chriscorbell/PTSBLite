import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  buildBendMesh,
  buildBlowerMesh,
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
  buildElevationPlane,
  buildFloorSeparator,
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
import { type PlenumBand } from "@/domain/floors";
import { type PortMarker } from "@/domain/renderer-affordances";
import { DEFAULT_BUILD_AREA } from "@/domain/sparse-grid";
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

/**
 * How far the camera may pull back, and how far it can see.
 *
 * A fixed limit cannot serve both ends of the build-area range: 140 frames a
 * 60 ft room with room to spare and leaves a 300 ft one impossible to see
 * whole. The distance needed to fit a span across a 38 degree vertical field
 * is `span / (2 * tan(19deg))`, about 1.45x — applied to the footprint's
 * diagonal, with headroom, and never below what small designs already had.
 */
export function maxCameraDistance(area: BuildArea): number {
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
  cleanup?: () => void;
};

export type ViewportPlaceTarget = {
  partId?: string;
};

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
  /** Which floor the placement plane is on; the other floor's grid dims. */
  activeFloor?: 1 | 2 | null;
  /** The plenum's Y range on each floor; empty when the design has none. */
  plenumBands?: PlenumBand[];
  /**
   * The Y the camera orbits around — the active floor's base. Selecting a
   * floor has to bring the camera with it: a plane 31 ft up is edge-on or
   * behind a camera still aimed at the ground, and clicks at it land far
   * outside the build area.
   */
  focusY?: number;
};

export function Viewport({
  scene,
  buildArea = DEFAULT_BUILD_AREA,
  ghost,
  tool,
  onPlace,
  onHover,
  landingCells = [],
  activeElevation = 0,
  portMarkers = [],
  separatorY = null,
  activeFloor = null,
  plenumBands = [],
  focusY = 0
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
    // the volume actually being drawn, and runs on first render too.
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 200);
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

    function applyCamera() {
      const r = cam.distance;
      camera.position.set(
        cam.target.x + r * Math.cos(cam.pitch) * Math.sin(cam.yaw),
        cam.target.y + r * Math.sin(cam.pitch),
        cam.target.z + r * Math.cos(cam.pitch) * Math.cos(cam.yaw)
      );
      camera.lookAt(cam.target);
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
      requestRender
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
      cam.distance = Math.max(8, Math.min(limit, cam.distance * (1 + e.deltaY * 0.0015)));
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
      } else if (p.type === "terminal") {
        mesh = buildTerminalMesh();
        const c = cellCenter(p.cell);
        mesh.position.set(c[0], c[1], c[2]);
        mesh.quaternion.copy(dirToQuat(p.axis));
      } else if (p.type === "tube") {
        mesh = buildTubeMesh(p.from, p.to);
      } else if (p.type === "bend") {
        mesh = buildBendMesh(p);
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
    if (separatorY !== null) {
      ground.add(buildFloorSeparator(area, separatorY, activeFloor === 1));
    }
    for (const band of plenumBands) {
      ground.add(buildPlenumBand(area, band, activeFloor !== null && activeFloor !== band.floor));
    }
    s.scene3.add(ground);
    s.groundGroup = ground;

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
  }, [areaWidth, areaDepth, areaHeight, separatorY, activeFloor, plenumBands]);

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
      }
      if (mesh) s.ghostGroup.add(mesh);
      if (s.renderer) {
        const size = s.renderer.getSize(new THREE.Vector2());
        updateLineResolutions(s.ghostGroup, size.x, size.y);
      }
    }
    s.requestRender?.();
  }, [ghost]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.overlayGroup) return;
    clearGroup(s.overlayGroup);
    for (const cell of landingCells) {
      s.overlayGroup.add(buildLandingCellHighlight(cell, tool));
    }
    s.requestRender?.();
  }, [landingCells, tool]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s.planeGroup || !s.hoverPlane) return;
    clearGroup(s.planeGroup);
    s.hoverPlane.position.y = activeElevation;
    // Show the plane itself while a tool would place onto it above the ground;
    // at ground level the ground grid already marks it, and the cursor and
    // erase tools do not place on the plane at all.
    const placesOnPlane = tool !== "cursor" && tool !== "erase";
    if (placesOnPlane && activeElevation > 0) {
      s.planeGroup.add(
        buildElevationPlane(
          { width: areaWidth, depth: areaDepth, height: areaHeight },
          activeElevation
        )
      );
    }
    s.requestRender?.();
  }, [activeElevation, tool, areaWidth, areaDepth, areaHeight]);

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
