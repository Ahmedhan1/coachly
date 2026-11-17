export interface RegionBox {
  center: { x: number; y: number };
  /** Width and height of the focus region's bounding box. */
  size: { w: number; h: number };
}

/** A wide region (arms, chest) may fill most of the width; only the height uses the looser `fill`. */
const WIDTH_FILL = 0.92;

/**
 * Camera target and visible height for a picture of `aspect` (width / height): the region fills `fill` of the
 * frame, but never less than `minShare` of the body height. Returns the visible world height.
 */
export function regionView(region: RegionBox, bodyHeight: number, aspect: number, fill: number, minShare: number): { x: number; y: number; visibleHeight: number } {
  const byHeight = region.size.h / fill;
  const byWidth = region.size.w / WIDTH_FILL / Math.max(aspect, 0.01);
  const visibleHeight = Math.min(bodyHeight * 1.12, Math.max(byHeight, byWidth, bodyHeight * minShare));
  return { x: region.center.x, y: region.center.y, visibleHeight };
}

/** Camera distance that shows `visibleHeight` with the given vertical field of view (degrees). */
export function distanceForHeight(visibleHeight: number, fovDeg: number, halfDepth: number): number {
  return visibleHeight / 2 / Math.tan((fovDeg * Math.PI) / 360) + halfDepth;
}
