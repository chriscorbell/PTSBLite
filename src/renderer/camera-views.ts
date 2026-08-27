/**
 * The named camera angles the View menu snaps to, and the ones the exported
 * PDF is rendered from.
 *
 * One list because the client asked for both from the same set — "snap to
 * diagonal views" in the menu, and "5 total screen grabs, one from each
 * diagonal angle, and then a top-down" in the document. A reader comparing a
 * page of the PDF against the screen should be looking at the same view.
 *
 * Named by where the camera stands, on the plan convention that -Z is north
 * and +X is east. The camera sits at
 * `target + r * (cos(pitch)sin(yaw), sin(pitch), cos(pitch)cos(yaw))`, so a
 * yaw of pi/4 puts it over +X +Z — the south-east corner.
 */
export type CameraView = {
  id: string;
  label: string;
  yaw: number;
  pitch: number;
};

const QUARTER = Math.PI / 4;

/** Looking almost straight down. Not pi/2: the orbit clamps its pitch at 1.45. */
const TOP_DOWN_PITCH = 1.45;

/** High enough to see over the near wall, low enough to read elevation. */
const DIAGONAL_PITCH = 0.62;

export const STANDARD_VIEWS: CameraView[] = [
  { id: "nw", label: "North-west", yaw: -3 * QUARTER, pitch: DIAGONAL_PITCH },
  { id: "ne", label: "North-east", yaw: 3 * QUARTER, pitch: DIAGONAL_PITCH },
  { id: "se", label: "South-east", yaw: QUARTER, pitch: DIAGONAL_PITCH },
  { id: "sw", label: "South-west", yaw: -QUARTER, pitch: DIAGONAL_PITCH },
  { id: "top", label: "Top-down", yaw: QUARTER, pitch: TOP_DOWN_PITCH }
];
