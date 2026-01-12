// Monorail Plugin Constants

// Colors - dark theme
export const COLORS = {
  bg: { r: 0.06, g: 0.06, b: 0.1 },           // Dark blue-black background
  headline: { r: 0.996, g: 0.953, b: 0.78 },   // Warm cream for headlines
  body: { r: 0.83, g: 0.83, b: 0.85 },         // Light gray for body text
  muted: { r: 0.61, g: 0.64, b: 0.69 },        // Muted gray for sublines
  accent: { r: 0.86, g: 0.15, b: 0.15 },       // Red accent
  white: { r: 0.98, g: 0.98, b: 0.98 },        // Near white
  blue: { r: 0.05, g: 0.6, b: 1 },             // Accent blue
  dimmed: { r: 0.3, g: 0.3, b: 0.35 },         // Dimmed elements
  // Position cards colors
  cyan: { r: 0.0, g: 0.74, b: 0.84 },          // Cyan for accents
  green: { r: 0.22, g: 0.78, b: 0.55 },        // Green for "Built" badge
  orange: { r: 0.95, g: 0.55, b: 0.15 },       // Orange for features
  cardBg: { r: 0.1, g: 0.1, b: 0.12 },         // Card background
  cardBgHighlight: { r: 0.12, g: 0.14, b: 0.16 }, // Highlighted card (middle)
  featureBg: { r: 0.08, g: 0.08, b: 0.1 },     // Feature row background
};

// Slide dimensions
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

// ID mapping storage key
export const MAPPING_KEY = 'monorail_id_mapping';

// Color type for reuse
export type RGB = { r: number; g: number; b: number };
