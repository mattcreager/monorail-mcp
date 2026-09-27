/**
 * Pure typography helpers for the text primitive: CSS-ish weight, line-height
 * and letter-spacing values → Figma font styles and units. No Figma API here,
 * so it runs under node:test.
 */

/** Figma style names in order of weight. Variable Google fonts expose these. */
const WEIGHT_STYLES: Array<[number, string]> = [
  [100, 'Thin'], [200, 'ExtraLight'], [300, 'Light'], [400, 'Regular'],
  [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black'],
];

const WEIGHT_NAMES: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
  normal: 400, regular: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
  bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
};

/** Normalise a CSS weight (number or name) to 100–900, or undefined when absent. */
export function normaliseWeight(weight?: number | string | null, bold?: boolean): number | undefined {
  if (weight === undefined || weight === null || weight === '') return bold ? 700 : undefined;
  if (typeof weight === 'string') {
    const key = weight.trim().toLowerCase().replace(/[\s_-]/g, '');
    if (key in WEIGHT_NAMES) return WEIGHT_NAMES[key];
    const n = Number(weight);
    if (!Number.isFinite(n)) throw new Error(`Unknown font weight "${weight}"`);
    weight = n;
  }
  if (!Number.isFinite(weight) || weight < 1 || weight > 1000) throw new Error(`Font weight out of range: ${weight}`);
  // Round to the nearest hundred, halves down: 650 → 600 (SemiBold), 450 → 400.
  return Math.min(900, Math.max(100, Math.round(weight / 100 - 0.01) * 100));
}

/**
 * Figma style names to try for a weight, best first. A weight the family
 * lacks degrades toward its neighbours before collapsing to Bold/Regular.
 */
export function styleCandidates(weight: number): string[] {
  const idx = WEIGHT_STYLES.findIndex(([w]) => w === weight);
  if (idx < 0) return ['Regular'];
  const out = [WEIGHT_STYLES[idx][1]];
  for (let d = 1; d < WEIGHT_STYLES.length; d++) {
    // Prefer the heavier neighbour for ≥ 500 (keeps emphasis), lighter for < 500.
    const order = weight >= 500 ? [idx + d, idx - d] : [idx - d, idx + d];
    for (const j of order) if (j >= 0 && j < WEIGHT_STYLES.length) out.push(WEIGHT_STYLES[j][1]);
  }
  // Names some families use instead of the canonical ones.
  const aliases: Record<string, string[]> = { SemiBold: ['Semibold', 'Demi Bold', 'DemiBold'], ExtraBold: ['Extra Bold', 'Heavy'], ExtraLight: ['Extra Light'] };
  const expanded: string[] = [];
  for (const s of out) { expanded.push(s); for (const a of aliases[s] ?? []) expanded.push(a); }
  return Array.from(new Set(expanded));
}

export interface FigmaUnitValue { value: number; unit: 'PIXELS' | 'PERCENT' }

/**
 * Line height: a bare number ≤ 3 is a CSS multiplier (1.04 → 104%), a larger
 * number is pixels, "120%" is percent, "40px" is pixels. undefined → leave
 * Figma's auto line height.
 */
export function resolveLineHeight(v?: number | string | null): FigmaUnitValue | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'auto' || s === 'normal') return undefined;
    if (s.endsWith('%')) return pct(parseFloat(s));
    if (s.endsWith('px')) return px(parseFloat(s));
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Bad lineHeight "${v}"`);
    v = n;
  }
  if (!Number.isFinite(v) || v <= 0) throw new Error(`Bad lineHeight ${v}`);
  return v <= 3 ? pct(v * 100) : px(v);
}

/**
 * Letter spacing: a bare number is pixels (already scaled by the caller),
 * "-0.035em" or "-3.5%" is percent of the font size, "2px" is pixels.
 */
export function resolveLetterSpacing(v?: number | string | null): FigmaUnitValue | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'normal') return undefined;
    if (s.endsWith('em')) return pct(parseFloat(s) * 100);
    if (s.endsWith('%')) return pct(parseFloat(s));
    if (s.endsWith('px')) return px(parseFloat(s));
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Bad letterSpacing "${v}"`);
    v = n;
  }
  if (!Number.isFinite(v)) throw new Error(`Bad letterSpacing ${v}`);
  return px(v);
}

function pct(value: number): FigmaUnitValue {
  if (!Number.isFinite(value)) throw new Error('Bad percent value');
  return { value: round(value), unit: 'PERCENT' };
}
function px(value: number): FigmaUnitValue {
  if (!Number.isFinite(value)) throw new Error('Bad pixel value');
  return { value: round(value), unit: 'PIXELS' };
}
function round(n: number): number { return Math.round(n * 1000) / 1000; }
