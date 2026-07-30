/**
 * Pure geometry helpers for `monorail_primitives`.
 *
 * These live outside the plugin on purpose. The primitives implementation is one
 * long `if/else` chain inside `figma.ui.onmessage`, closed over `figma`,
 * `targetSlide` and friends — nothing in it is reachable from a test process. So
 * the decisions that are easy to get silently wrong (which axis is which, where
 * a path's origin lands, what a direction token means) are factored out here,
 * where `test/geometry.test.js` can pin them without Figma.
 *
 * Every function in this file must stay free of Figma API calls.
 */

export interface Point {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface DirectionResult {
  /** Degrees, screen-oriented: positive reads clockwise (y grows down). */
  degrees: number;
  /** Set when the input wasn't recognised, so the caller can warn instead of guessing. */
  warning?: string;
}

/**
 * Resolve a direction token to screen degrees.
 *
 * An unrecognised value returns a warning rather than quietly meaning 'right'.
 * `direction` is overloaded across ops — 'VERTICAL'/'HORIZONTAL' are valid for
 * auto layout and meaningless for a line — so a copy-pasted value lands here and
 * would otherwise draw a confidently wrong line with no signal.
 */
export function resolveDirectionDegrees(dir?: string | number): DirectionResult {
  if (typeof dir === 'number') return { degrees: dir };
  switch (dir) {
    case 'down':
      return { degrees: 90 };
    case 'left':
      return { degrees: 180 };
    case 'up':
      return { degrees: -90 };
    case 'right':
    case undefined:
      return { degrees: 0 };
    default:
      return {
        degrees: 0,
        warning: `Unrecognised direction "${dir}" — expected up/down/left/right or degrees`,
      };
  }
}

/** `6` becomes an even 6/6 pattern; an array passes through unchanged. */
export function resolveDash(dash?: number | number[]): number[] | undefined {
  if (dash === undefined) return undefined;
  return Array.isArray(dash) ? dash : [dash, dash];
}

export interface NormalisedPath {
  /** Vertices in the vector's local space, with the top-left of the hull at (0, 0). */
  vertices: Point[];
  /** Where the node has to sit for those vertices to land on the caller's points. */
  x: number;
  y: number;
}

/**
 * Move a set of points into a vector's local space, and report where the node
 * must sit so the geometry lands where the caller asked.
 *
 * Vertices are always interpreted relative to the node's own origin, so points
 * given in slide coordinates — the natural way to describe a connector between
 * two boxes whose positions you already know — used to produce a vector whose
 * geometry sat far from an origin that was itself pinned at (0, 0). Every such
 * path ended up in the slide's top-left corner.
 *
 * `offsetX`/`offsetY` are added on top, so relative points with an explicit x/y
 * behave exactly as before (their hull minimum is 0).
 */
export function normalisePath(points: Point[], offsetX: number = 0, offsetY: number = 0): NormalisedPath {
  if (points.length < 2) {
    throw new Error('Path requires at least 2 points');
  }
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  return {
    vertices: points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    x: offsetX + minX,
    y: offsetY + minY,
  };
}

export type SizingMode = 'FIXED' | 'AUTO';

export interface AutoLayoutSizing {
  primaryAxisSizingMode: SizingMode;
  counterAxisSizingMode: SizingMode;
}

/**
 * Which auto-layout axes should be fixed, given the dimensions the caller supplied.
 *
 * For a VERTICAL frame the counter axis is horizontal (width) and the primary
 * axis is vertical (height); HORIZONTAL swaps them. Getting this backwards pins
 * the axis that should hug, which either stops a list growing for its children or
 * collapses it to nothing — and it looks like a layout bug rather than a mapping
 * bug, so it is worth having pinned by a test.
 */
export function autoLayoutSizing(
  layoutMode: 'VERTICAL' | 'HORIZONTAL',
  width?: number,
  height?: number
): AutoLayoutSizing {
  const isVertical = layoutMode === 'VERTICAL';
  const crossSize = isVertical ? width : height;
  const mainSize = isVertical ? height : width;
  return {
    counterAxisSizingMode: crossSize ? 'FIXED' : 'AUTO',
    primaryAxisSizingMode: mainSize ? 'FIXED' : 'AUTO',
  };
}

/**
 * The layoutSizing property a child must set to fill its parent's cross axis.
 *
 * `layoutAlign = 'STRETCH'` does not beat a child's own hug sizing — that is why
 * the first attempt at `stretch: true` visibly did nothing.
 */
export function crossAxisSizingProp(parentIsVertical: boolean): 'layoutSizingHorizontal' | 'layoutSizingVertical' {
  return parentIsVertical ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
}

/** The layoutSizing property a child must set to absorb slack along the main axis. */
export function mainAxisSizingProp(parentIsVertical: boolean): 'layoutSizingHorizontal' | 'layoutSizingVertical' {
  return parentIsVertical ? 'layoutSizingVertical' : 'layoutSizingHorizontal';
}
