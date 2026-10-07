export interface Camera {
  panX: number;
  panY: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const MIN_MAP_SCALE = 0.55;
export const MAX_MAP_SCALE = 2.6;
export const NAV_HEIGHT = 72;
export const BEACON_WORLD: Point = { x: 480, y: 480 };
export const WORLD_SIZE = 1400;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, scale));
}

export function worldToScreen(world: Point, camera: Camera): Point {
  return {
    x: world.x * camera.scale + camera.panX,
    y: world.y * camera.scale + camera.panY,
  };
}

export function screenToWorld(screen: Point, camera: Camera): Point {
  const scale = camera.scale === 0 ? 1 : camera.scale;
  return {
    x: (screen.x - camera.panX) / scale,
    y: (screen.y - camera.panY) / scale,
  };
}

// Scale around the focal screen point so the world coordinate under the
// fingers stays under the fingers (affine focal-anchor zoom).
export function zoomAboutFocal(camera: Camera, nextScale: number, focal: Point): Camera {
  const scale = clampScale(nextScale);
  const world = screenToWorld(focal, camera);
  return {
    scale,
    panX: focal.x - world.x * scale,
    panY: focal.y - world.y * scale,
  };
}

export function panToCenter(world: Point, opticalCenter: Point, scale: number): Camera {
  const safeScale = clampScale(scale);
  return {
    scale: safeScale,
    panX: opticalCenter.x - world.x * safeScale,
    panY: opticalCenter.y - world.y * safeScale,
  };
}

export function shiftPanForOpticalCenter(camera: Camera, previous: Point, next: Point): Camera {
  return {
    ...camera,
    panX: camera.panX + (next.x - previous.x),
    panY: camera.panY + (next.y - previous.y),
  };
}

// The map is full-bleed. The optical center is the midpoint of the opening
// between the header and the sliding sheet (plus the bottom dock).
export function opticalCenter(params: {
  canvasWidth: number;
  canvasHeight: number;
  headerHeight: number;
  drawerHeight: number;
  navHeight: number;
}): Point {
  const top = clamp(params.headerHeight, 0, Math.max(0, params.canvasHeight));
  const bottomInset = clamp(
    params.drawerHeight + params.navHeight,
    0,
    Math.max(0, params.canvasHeight),
  );
  const visibleHeight = Math.max(0, params.canvasHeight - top - bottomInset);
  return {
    x: params.canvasWidth / 2,
    y: top + visibleHeight / 2,
  };
}

export function viewportBounds(
  camera: Camera,
  width: number,
  height: number,
  padding = 48,
): ViewportBounds {
  const min = screenToWorld({ x: -padding, y: -padding }, camera);
  const max = screenToWorld({ x: width + padding, y: height + padding }, camera);
  return {
    minX: Math.min(min.x, max.x),
    maxX: Math.max(min.x, max.x),
    minY: Math.min(min.y, max.y),
    maxY: Math.max(min.y, max.y),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
