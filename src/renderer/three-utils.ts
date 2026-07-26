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
  grid: 0x1f2530,
  gridStrong: 0x2a3140,
  ground: 0x10141b,
  accent: 0x5eead4,
  accentDim: 0x2e7e78,
  warn: 0xf4b43a,
  danger: 0xef5667,
  blower: 0x3f4a60,
  blowerEdge: 0x6a7691,
  terminal: 0x5b6477,
  terminalEdge: 0x8b95a7,
  tube: 0x8e96a5,
  tubeEdge: 0xb8bfcd,
  bend: 0x8e96a5,
  obstacle: 0xc23a48,
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
    geometry?.dispose();
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
