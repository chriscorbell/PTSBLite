import * as THREE from "three";
import type { ToolId, Vec3 } from "@/types";

/**
 * Pointer interaction, as pure functions over plain values.
 *
 * Orbiting, click-versus-drag discrimination and cell picking are the parts of
 * the viewport with real logic and no GPU, so they are kept testable and out of
 * the effect that owns the renderer.
 */

type PointerPoint = {
  x: number;
  y: number;
};

export type ViewportDragState = {
  active: boolean;
  dragging: boolean;
  dragX: number;
  dragY: number;
  downX: number;
  downY: number;
};

export function createViewportDragState(): ViewportDragState {
  return {
    active: false,
    dragging: false,
    dragX: 0,
    dragY: 0,
    downX: 0,
    downY: 0
  };
}

export function beginViewportDrag(
  state: ViewportDragState,
  point: PointerPoint
): ViewportDragState {
  return {
    ...state,
    active: true,
    dragging: false,
    dragX: point.x,
    dragY: point.y,
    downX: point.x,
    downY: point.y
  };
}

export function moveViewportDrag(
  state: ViewportDragState,
  point: PointerPoint,
  buttons: number
): { state: ViewportDragState; delta: PointerPoint | null } {
  if (!state.active || !(buttons & 1)) return { state, delta: null };

  const dx = point.x - state.dragX;
  const dy = point.y - state.dragY;
  const dragging = state.dragging || Math.abs(dx) + Math.abs(dy) > 3;
  const next = { ...state, dragging };

  if (!dragging) return { state: next, delta: null };

  next.dragX = point.x;
  next.dragY = point.y;
  return { state: next, delta: { x: dx, y: dy } };
}

export function isViewportClick(state: ViewportDragState, point: PointerPoint): boolean {
  return Math.abs(point.x - state.downX) + Math.abs(point.y - state.downY) < 4 && !state.dragging;
}

export function endViewportDrag(state: ViewportDragState): ViewportDragState {
  return {
    ...state,
    active: false,
    dragging: false
  };
}

export function partIdForObject(object: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.partId === "string") return current.userData.partId;
    current = current.parent;
  }
  return undefined;
}

export function landingCellForObject(object: THREE.Object3D): Vec3 | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const cell = current.userData.landingCell as Vec3 | undefined;
    if (Array.isArray(cell) && cell.length === 3) return cell;
    current = current.parent;
  }
  return null;
}

export function cellFromWorldPoint(point: Pick<THREE.Vector3, "x" | "y" | "z">): Vec3 {
  return [Math.floor(point.x), Math.floor(point.y), Math.floor(point.z)];
}

export function clickCellForTool(
  tool: ToolId,
  fallbackCell: Vec3 | null,
  partHitPoint?: Pick<THREE.Vector3, "x" | "y" | "z">
): Vec3 | null {
  if (tool === "erase" && partHitPoint) return cellFromWorldPoint(partHitPoint);
  return fallbackCell;
}
