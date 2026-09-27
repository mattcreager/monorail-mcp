/**
 * Pure helpers behind native object animations ("reveals").
 *
 * Figma Slides has object animations that play in presentation mode. The
 * Plugin API (update 130+, `figma.motion`) exposes them as animation styles
 * applied to a node with a duration and a timeline offset — there is no
 * click-trigger field in the API, so Monorail models a build step as a
 * position on the slide's timeline: step N starts at N × stepSeconds.
 *
 * Nothing here touches the Figma API, so it runs under node:test.
 */

export const DEFAULT_STEP_SECONDS = 1.5;
export const DEFAULT_REVEAL_DURATION = 0.4;

export interface RevealSpec {
  /** Build step. 1 = first advance. 0 = animates in as the slide opens. */
  step?: number;
  /** Explicit timeline offset in seconds. Overrides step when given. */
  offset?: number;
  /** Animation length in seconds. */
  duration?: number;
  /** Animation style: a styleId, or a (partial, case-insensitive) style name such as "fade in". */
  style?: string;
  /** Style-specific props passed straight through, e.g. { direction: 'right', distance: 120 }. */
  props?: Record<string, unknown>;
  /** Last build step the element is visible at (Slides step-slide builds only). Omit for "stays". */
  until?: number;
}

export interface NormalisedReveal {
  step?: number;
  offset: number;
  duration: number;
  style?: string;
  props?: Record<string, unknown>;
  until?: number;
}

/**
 * Turn the loose `reveal` field a caller writes into a fully resolved spec.
 * A bare number is a step. Returns undefined when there is nothing to reveal.
 */
export function normaliseReveal(
  spec: RevealSpec | number | undefined | null,
  stepSeconds: number = DEFAULT_STEP_SECONDS,
): NormalisedReveal | undefined {
  if (spec === undefined || spec === null || spec === false as unknown) return undefined;
  const s: RevealSpec = typeof spec === 'number' ? { step: spec } : spec;
  if (!(stepSeconds > 0)) throw new Error(`step_seconds must be > 0, got ${stepSeconds}`);

  const duration = s.duration ?? DEFAULT_REVEAL_DURATION;
  if (!(duration > 0)) throw new Error(`reveal.duration must be > 0, got ${duration}`);

  let offset: number;
  if (s.offset !== undefined) {
    if (!(s.offset >= 0)) throw new Error(`reveal.offset must be >= 0, got ${s.offset}`);
    offset = s.offset;
  } else {
    const step = s.step ?? 1;
    if (!Number.isInteger(step) || step < 0) throw new Error(`reveal.step must be a non-negative integer, got ${step}`);
    offset = step * stepSeconds;
  }

  const step = s.offset === undefined ? (s.step ?? 1) : undefined;
  if (s.until !== undefined) {
    if (!Number.isInteger(s.until) || s.until < 0) throw new Error(`reveal.until must be a non-negative integer, got ${s.until}`);
    const from = step ?? Math.ceil(offset / stepSeconds);
    if (s.until < from) throw new Error(`reveal.until (${s.until}) is before the step it appears at (${from})`);
  }
  return {
    step,
    offset,
    duration,
    style: s.style,
    props: s.props,
    until: s.until,
  };
}

export interface StyleLike {
  styleId: string;
  name: string;
}

const APPEAR_PATTERN = /fade\s*in|appear|fade/i;

/**
 * Choose an animation style from the list Figma reports for the document.
 * Matching order: exact styleId, exact name, name contains the request,
 * request contains the name. Without a request, prefer an appear/fade-in
 * style, then the first style available. Undefined when nothing fits, so the
 * caller can fall back to a manual opacity keyframe track.
 */
export function pickAnimationStyle<T extends StyleLike>(styles: ReadonlyArray<T>, wanted?: string): T | undefined {
  if (!styles || styles.length === 0) return undefined;
  if (wanted && wanted.trim()) {
    const w = wanted.trim().toLowerCase();
    return (
      styles.find(s => s.styleId === wanted) ??
      styles.find(s => s.name.toLowerCase() === w) ??
      styles.find(s => s.name.toLowerCase().includes(w)) ??
      styles.find(s => w.includes(s.name.toLowerCase()))
    );
  }
  return styles.find(s => APPEAR_PATTERN.test(s.name)) ?? styles[0];
}

/** The timeline must run at least this long for the reveal to finish. */
export function revealEndsAt(reveal: NormalisedReveal): number {
  return reveal.offset + reveal.duration;
}

/**
 * Which build step a reveal belongs to when steps must be discrete — the
 * Slides fallback makes one slide per step. An explicit offset rounds up to
 * the step it falls in; offset 0 is step 0 (present from the start).
 */
export function stepFromReveal(reveal: NormalisedReveal, stepSeconds: number = DEFAULT_STEP_SECONDS): number {
  if (reveal.step !== undefined) return reveal.step;
  if (!(stepSeconds > 0)) throw new Error(`step_seconds must be > 0, got ${stepSeconds}`);
  return Math.ceil(reveal.offset / stepSeconds);
}

/** Slide transitions the Plugin API accepts for builds between step slides. */
export const BUILD_TRANSITIONS = ['SMART_ANIMATE', 'DISSOLVE', 'NONE'] as const;
export type BuildTransition = typeof BUILD_TRANSITIONS[number];

export function normaliseTransition(t?: string): BuildTransition {
  if (!t) return 'SMART_ANIMATE';
  const u = t.toUpperCase().replace(/[\s-]+/g, '_');
  if ((BUILD_TRANSITIONS as ReadonlyArray<string>).includes(u)) return u as BuildTransition;
  throw new Error(`transition must be one of ${BUILD_TRANSITIONS.join(', ')}, got "${t}"`);
}
