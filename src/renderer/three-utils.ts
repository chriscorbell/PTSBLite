import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Vec3 } from "@/types";

/**
 * The bits of Three.js plumbing every part of the viewport needs: the palette,
 * the vector conversions, and — the reason this file exists — disposal.
 *
 * Detaching an object from the scene graph does not free its geometries,
 * materials or textures. Anything rebuilt has to be disposed explicitly or the
 * buffers accumulate for the lifetime of the WebGL context.
 */

export const VP = {
  bg: 0x0b0e13,
  // The grid lines and the scenery drawn over them (walls, ceiling, the slab
  // between floors) used to share one color, which is why the grid vanished
  // under a wall: the lines and the wash over them were the same shade. They
  // are separate now, and the grid is pitched to hold its contrast against the
  // room's floor seen through two translucent walls at once.
  grid: 0x2e3746,
  gridMajor: 0x4a5570,
  structure: 0x2a3140,
  ground: 0x10141b,
  // The room's floor, a step brighter than the ground outside it so the room
  // reads as a place without shouting over the parts placed in it.
  groundRoom: 0x1a202b,
  accent: 0x5eead4,
  accentDim: 0x2e7e78,
  warn: 0xf4b43a,
  danger: 0xef5667,
  // The Kel2020 hardware, modelled from the media at kellytubesystems.com/kel2020
  // (ADR-0026). The real power unit is matte black; graphite rather than black
  // because the viewport's ground is nearly black already and a true black drum
  // disappears into the room floor.
  blower: 0x30363f,
  blowerEdge: 0x7a8598,
  // A terminal is a clear barrel between two brushed collars, so its body colour
  // is the collar and the barrel has its own, near-transparent, tint.
  terminal: 0x8f97a6,
  terminalEdge: 0xb3bbc9,
  terminalGlass: 0xd7e3f0,
  // The door cage over the barrel, tan-anodised on the real unit.
  terminalDoor: 0xa9a390,
  // The green a Kel2020 signs itself with: the power light, the send button and
  // the wordmark down the door.
  signal: 0x4ade80,
  tube: 0x8e96a5,
  tubeEdge: 0xb8bfcd,
  bend: 0x8e96a5,
  // A split sleeve is much darker than the tube it wraps, which is what makes a
  // joint read as a joint from across the room rather than as a bulge.
  sleeve: 0x1c2129,
  sleeveBolt: 0x99a3b4,
  obstacle: 0xc23a48,
  obstaclePenetrable: 0x5b8fd9,
  port: 0x5eead4
};

export const TUBE_R = 0.22;

/**
 * How the camera is framed on open, and what "Reset view" returns to.
 *
 * One constant because these used to be two: the app opened at distance 38 and
 * reset to 32, so resetting the view moved the camera somewhere it had never
 * been and could not be returned to (issue #10).
 */

export const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Fat lines (LineMaterial) convert their pixel linewidth using a resolution
 * uniform, so it must track the canvas size or the lines render at the wrong
 * thickness. Call this after every resize for every fat line in the scene.
 */
export function updateLineResolutions(root: THREE.Object3D, width: number, height: number): void {
  root.traverse((child) => {
    const mat = (child as THREE.Mesh).material;
    if (mat instanceof LineMaterial) mat.resolution.set(width, height);
  });
}

/** Any node that may own GPU resources: Mesh, LineSegments, LineSegments2, Sprite. */

/** Any node that may own GPU resources: Mesh, LineSegments, LineSegments2, Sprite. */
export type ResourceNode = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

/**
 * Release the GPU resources held by `object` and everything below it. Detaching
 * an object from the scene graph does not free its geometries, materials, or
 * textures, so anything we rebuild has to be disposed explicitly or the buffers
 * accumulate for the lifetime of the WebGL context.
 */

/**
 * Release the GPU resources held by `object` and everything below it. Detaching
 * an object from the scene graph does not free its geometries, materials, or
 * textures, so anything we rebuild has to be disposed explicitly or the buffers
 * accumulate for the lifetime of the WebGL context.
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const { geometry, material } = node as ResourceNode;
    // Every THREE.Sprite shares one static geometry owned by three.js, so
    // disposing it here deletes the GPU buffer for sprites that have nothing
    // to do with this object — including ones created later, which then build
    // correctly and silently render nothing. Their material and texture are
    // per-sprite and still ours to release.
    if (!(node as THREE.Sprite).isSprite) geometry?.dispose();
    if (Array.isArray(material)) {
      for (const single of material) disposeMaterial(single);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  // Label sprites carry a CanvasTexture that has to go with the material.
  const { map } = material as THREE.Material & { map?: THREE.Texture | null };
  map?.dispose();
  material.dispose();
}

/** Detach and dispose every child of `group`, leaving the group itself in place. */

/** Detach and dispose every child of `group`, leaving the group itself in place. */
export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

export function cellCenter(c: Vec3): Vec3 {
  return [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5];
}

export function dirToQuat(dir: Vec3): THREE.Quaternion {
  const target = new THREE.Vector3(dir[0], dir[1], dir[2]);
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), target);
}
