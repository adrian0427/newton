/**
 * Where the student has placed Newton. Stored as viewport fractions so the
 * position survives resizes; CSS clamps keep him fully on screen.
 */
export type ApplePosition =
  | { mode: "dock"; y: number }
  | { mode: "free"; x: number; y: number };

export const DEFAULT_POSITION: ApplePosition = { mode: "dock", y: 0.5 };
export const STORAGE_KEY = "newton.apple-position.v1";
/** Pointer travel before a press becomes a drag, so clicks never move him. */
export const DRAG_THRESHOLD = 4;
/** Dropping with his center this close to the right edge tucks him into the peek. */
export const DOCK_ZONE = 48;
/** Rendered size of the placed (unclipped) apple. */
export const APPLE_SIZE = 64;
export const KEY_STEP = 16;
export const KEY_STEP_LARGE = 64;

const fraction = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Validates untrusted localStorage content; anything malformed yields the default. */
export function parsePosition(raw: string | null): ApplePosition {
  if (!raw) return DEFAULT_POSITION;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_POSITION;
    const record = value as Record<string, unknown>;
    if (record.mode === "dock" && fraction(record.y)) return { mode: "dock", y: record.y };
    if (record.mode === "free" && fraction(record.x) && fraction(record.y)) return { mode: "free", x: record.x, y: record.y };
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_POSITION;
}

export function serializePosition(position: ApplePosition): string {
  return JSON.stringify(position);
}

export type Viewport = { width: number; height: number };

export function inDockZone(centerX: number, viewport: Viewport): boolean {
  return viewport.width - centerX <= DOCK_ZONE;
}

/** Converts a released drag (apple center in px) into a stored position. */
export function dropPosition(centerX: number, centerY: number, viewport: Viewport): ApplePosition {
  const y = clamp(centerY / Math.max(viewport.height, 1), 0, 1);
  if (inDockZone(centerX, viewport)) return { mode: "dock", y };
  return { mode: "free", x: clamp(centerX / Math.max(viewport.width, 1), 0, 1), y };
}

/** Apple center in px for the current position, kept fully on screen. */
export function positionCenter(position: ApplePosition, viewport: Viewport): { x: number; y: number } {
  const half = APPLE_SIZE / 2;
  const y = clamp(position.y * viewport.height, half, Math.max(half, viewport.height - half));
  if (position.mode === "dock") return { x: viewport.width - half, y };
  return { x: clamp(position.x * viewport.width, half, Math.max(half, viewport.width - half)), y };
}

export type MoveKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
export const isMoveKey = (key: string): key is MoveKey => ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key);

/**
 * Keyboard movement. Up/down slide along the edge while docked; left pulls him
 * out into the page; moving right into the dock zone tucks him back in.
 */
export function movePosition(position: ApplePosition, key: MoveKey, large: boolean, viewport: Viewport): ApplePosition {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;
  const center = positionCenter(position, viewport);
  if (position.mode === "dock" && key === "ArrowRight") return position;
  if (position.mode === "dock" && key === "ArrowLeft") center.x = viewport.width - DOCK_ZONE - APPLE_SIZE / 2 - step;
  if (position.mode === "free" && key === "ArrowLeft") center.x -= step;
  if (key === "ArrowRight") center.x += step;
  if (key === "ArrowUp") center.y -= step;
  if (key === "ArrowDown") center.y += step;
  return dropPosition(center.x, center.y, viewport);
}

/** Unit vector Newton looks along; { x: 0, y: 0 } means straight ahead. */
export type Gaze = { x: number; y: number };
/** The approved artwork looks left, toward the whiteboard from the right edge. */
export const DEFAULT_GAZE: Gaze = { x: -1, y: 0 };
export const GAZE_CENTER_RADIUS = 70;
type Box = { left: number; top: number; width: number; height: number };

/**
 * Looks from Newton's center at the center of the whiteboard pane. A hidden pane
 * (zero size) or a target within GAZE_CENTER_RADIUS yields a straight-ahead gaze.
 */
export function gazeToward(from: { x: number; y: number }, target: Box | null): Gaze {
  if (!target || target.width <= 0 || target.height <= 0) return { x: 0, y: 0 };
  const dx = target.left + target.width / 2 - from.x, dy = target.top + target.height / 2 - from.y;
  const length = Math.hypot(dx, dy);
  if (length < GAZE_CENTER_RADIUS) return { x: 0, y: 0 };
  // Rounded so layout jitter does not re-render him.
  return { x: Math.round((dx / length) * 100) / 100, y: Math.round((dy / length) * 100) / 100 };
}

/** Face and pupil offsets in apple artwork units, matching the Figma gaze set. */
export function gazeOffsets(gaze: Gaze) {
  return { face: { x: gaze.x * 2.85, y: gaze.y * 1.5 }, pupils: { x: gaze.x * 1.05, y: gaze.y * 1.4 } };
}
