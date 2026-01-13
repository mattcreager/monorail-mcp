/**
 * Monorail Shared Types
 * 
 * Core type definitions shared between the MCP server and Figma plugin.
 * Import with: import type { SlideContent, Slide, DeckIR } from '../shared/types.js';
 */

// =============================================================================
// SLIDE CONTENT TYPES
// =============================================================================

/**
 * Visual element configuration (diagrams, SVG, etc.)
 */
export interface VisualElement {
  type: 'svg' | 'cycle';
  /** Raw SVG string (for type: 'svg') */
  content?: string;
  /** Labels for each node in the cycle (for type: 'cycle') */
  nodes?: string[];
  /** Color for each node */
  colors?: Array<'cyan' | 'green' | 'orange' | 'pink' | 'purple' | 'blue' | 'white'>;
  /** Icon for each node */
  icons?: Array<'presence' | 'lightbulb' | 'refresh' | 'chart' | 'magnet' | 'rocket' | 'target' | 'users' | 'check' | 'star'>;
  /** Position relative to text content */
  position?: 'right' | 'below' | 'center';
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
}

/**
 * Card content for position-cards archetype
 */
export interface CardContent {
  label: string;
  title: string;
  body: string;
  badge?: string;
  badge_color?: 'green' | 'cyan' | 'orange';
}

/**
 * Feature item for position-cards archetype
 */
export interface FeatureItem {
  label: string;
  description: string;
}

/**
 * Timeline stage
 */
export interface TimelineStage {
  label: string;
  description?: string;
}

/**
 * Two-column content block
 */
export interface ColumnContent {
  title: string;
  body: string;
}

/**
 * Chart configuration
 */
export interface ChartConfig {
  type: string;
  placeholder?: boolean;
}

/**
 * Content fields available to slides.
 * Different archetypes use different subsets of these fields.
 */
export interface SlideContent {
  // Common
  headline?: string;
  subline?: string;
  
  // Bullets archetype
  bullets?: string[];
  
  // Quote archetype
  quote?: string;
  attribution?: string;
  
  // Chart archetype
  takeaway?: string;
  chart?: ChartConfig;
  
  // Two-column archetype
  left?: ColumnContent;
  right?: ColumnContent;
  
  // Timeline archetype
  stages?: TimelineStage[];
  
  // Comparison archetype
  columns?: string[];
  rows?: string[][];
  
  // Summary archetype
  items?: string[];
  
  // Position-cards archetype (Keycard-style)
  eyebrow?: string;
  cards?: CardContent[];
  features?: FeatureItem[];
  
  // Video archetype
  video_url?: string;
  caption?: string;
  
  // Visual element (diagram, icon, etc.)
  visual?: VisualElement;
}

// =============================================================================
// SLIDE & DECK TYPES
// =============================================================================

/**
 * Slide status indicates editing state.
 * - draft: Work in progress, can be modified
 * - locked: Finalized, won't be overwritten
 * - stub: Placeholder, needs content
 */
export type SlideStatus = 'draft' | 'locked' | 'stub';

/**
 * Available slide archetypes (templates).
 */
export type ArchetypeType = 
  | 'title'
  | 'section'
  | 'big-idea'
  | 'bullets'
  | 'two-column'
  | 'quote'
  | 'chart'
  | 'timeline'
  | 'comparison'
  | 'summary'
  | 'position-cards'
  | 'video'
  | 'unknown';

/**
 * Element info for rich read (Claude can see and target individual elements)
 */
export interface ElementInfo {
  /** Figma node ID (stable, for targeted updates) */
  id: string;
  /** Element type: 'section_label', 'headline', 'body_text', etc. */
  type: string;
  /** The text content */
  text: string;
  /** Absolute X position on slide */
  x: number;
  /** Absolute Y position on slide */
  y: number;
  fontSize: number;
  isBold: boolean;
  width: number;
  height: number;
  /** Parent frame name (helps identify context) */
  parentName: string;
  /** Nesting depth (0 = direct child of slide) */
  depth: number;
  /** True if deeply nested (likely part of diagram) */
  isInDiagram: boolean;
  /** Table cell metadata (only present for table cells) */
  isTableCell?: boolean;
  tableRow?: number;
  tableCol?: number;
}

/**
 * A single slide in the deck.
 */
export interface Slide {
  /** Stable identifier (survives reordering) */
  id: string;
  /** Which slide template/archetype */
  archetype: string;
  /** Editing state */
  status: SlideStatus;
  /** Archetype-specific content fields */
  content: SlideContent;
  /** Unrecognized text added by human (captured, not modified) */
  extras?: string[];
  /** Presenter notes */
  speaker_notes?: string;
  
  // Rich read fields (populated by pull, not required for push)
  /** Figma node ID for this slide */
  figma_id?: string;
  /** All text elements with IDs for targeting */
  elements?: ElementInfo[];
  /** True if complex nested content detected */
  has_diagram?: boolean;
}

/**
 * The intermediate representation for a deck.
 */
export interface DeckIR {
  deck?: { title: string };
  slides: Slide[];
  /** Auto Layout containers that support adding elements (from pull only) */
  containers?: AddableContainer[];
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface ValidationWarning {
  slideId: string;
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

// =============================================================================
// TEMPLATE EXTRACTION TYPES
// =============================================================================

/**
 * Captured node from Figma for template extraction.
 */
export interface CapturedNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Visual properties
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: any[];
  // Auto Layout (frames only)
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  // Text properties (text nodes only)
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: any;
  letterSpacing?: any;
  // Table properties (TABLE nodes only)
  numRows?: number;
  numColumns?: number;
  tableCells?: { row: number; col: number; text: string }[];
  // Children (recursive)
  children?: CapturedNode[];
}

/**
 * A template slot - an editable text or frame element.
 */
export interface TemplateSlot {
  /** Figma node ID */
  id: string;
  /** Inferred role: section_label, headline, accent_text, etc. */
  role: string;
  /** Nesting depth in tree */
  depth: number;
  bounds: { x: number; y: number; width: number; height: number };
  /** Text styling (for TEXT nodes) */
  text?: {
    sample: string;
    fontSize: number;
    fontFamily: string;
    fontStyle: string;
    color?: { r: number; g: number; b: number };
  };
  /** Frame styling (for container slots) */
  frame?: {
    fills: any[];
    strokes: any[];
    cornerRadius?: number;
    layoutMode?: string;
    itemSpacing?: number;
  };
  /** Name of parent frame (for context) */
  parentName: string;
}

/**
 * A complex region that wasn't captured as individual slots.
 */
export interface ComplexRegion {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  /** How many nodes inside */
  nodeCount: number;
  /** Why it's marked complex */
  reason: string;
}

/**
 * Extracted template from a slide.
 */
export interface ExtractedTemplate {
  source_slide_id: string;
  source_slide_name: string;
  slots: TemplateSlot[];
  complex_regions: ComplexRegion[];
  /** Slide background fill */
  background?: any;
  dimensions: { width: number; height: number };
  stats: {
    total_nodes_captured: number;
    slots_identified: number;
    nodes_filtered: number;
  };
}

// =============================================================================
// DESIGN SYSTEM TYPES
// =============================================================================

export interface ColorToken {
  name: string;
  rgb: { r: number; g: number; b: number };
  hex: string;
  /** Where this color was found */
  usage: string[];
}

export interface FontToken {
  family: string;
  style: string;
  /** All sizes seen */
  sizes: number[];
  /** What roles use this font */
  usage: string[];
}

export interface DesignSystem {
  colors: ColorToken[];
  fonts: FontToken[];
  spacing: {
    cardPadding?: number;
    itemSpacing?: number;
    slideMargin?: number;
  };
  corners: {
    cardRadius?: number;
    containerRadius?: number;
  };
  background: any;
}

// =============================================================================
// WEBSOCKET MESSAGE TYPES
// =============================================================================

export interface PatchChange {
  /** Figma node ID — TEXT node for edit/delete, FRAME container for add */
  target: string;
  /** New text content (required for edit/add, ignored for delete) */
  text?: string;
  /** Action: 'edit' (default) updates existing, 'add' creates new in container, 'delete' removes element */
  action?: 'edit' | 'add' | 'delete';
  /** For 'add' only: insert position (0=first, -1 or omit=append) */
  position?: number;
}

export interface PatchRequest {
  slide_id?: string;
  changes: PatchChange[];
}

export interface NewElement {
  id: string;
  name: string;
  container: string;
}

export interface DeletedElement {
  id: string;
  name: string;
  container: string;
}

export interface PatchResult {
  /** Number of existing elements edited */
  updated: number;
  /** Number of new elements added */
  added: number;
  /** Number of elements deleted */
  deleted: number;
  /** IDs that failed */
  failed: string[];
  /** Font substitutions made */
  fontSubstitutions?: string[];
  /** New elements created (for 'add' actions) */
  newElements?: NewElement[];
  /** Elements removed (for 'delete' actions) */
  deletedElements?: DeletedElement[];
}

export interface DeleteResult {
  deleted: number;
  failed: string[];
}

export interface ReorderResult {
  success: boolean;
  count?: number;
  error?: string;
}

export interface ScreenshotResult {
  success: boolean;
  slideId?: string;
  slideName?: string;
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface CloneResult {
  success: boolean;
  newSlideId?: string;
  updated?: number;
  failed?: string[];
  fontSubstitutions?: string[];
  error?: string;
}

export interface CaptureResult {
  template: CapturedNode | string;
  nodeCount: number;
}

// =============================================================================
// ADDABLE CONTAINER (AI DX: discoverable containers for action: "add")
// =============================================================================

/**
 * An Auto Layout container that supports adding new elements.
 * Surfaced in pull output so AI can discover targets for action: "add".
 */
export interface AddableContainer {
  /** Figma node ID - use this as target for action: "add" */
  id: string;
  /** Container name (e.g., "bullets-container", "items-container") */
  name: string;
  /** Parent slide's Figma ID */
  slide_id: string;
  /** Parent slide's name */
  slide_name: string;
  /** Number of children currently in container */
  child_count: number;
  /** What kind of elements this container holds */
  element_type: 'bullet' | 'item' | 'card' | 'column' | 'other';
  /** Usage hint for AI */
  hint: string;
}
