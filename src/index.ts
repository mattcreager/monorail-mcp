#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";

// Import shared types
import type {
  SlideContent,
  Slide,
  DeckIR,
  ValidationWarning,
  CapturedNode,
  TemplateSlot,
  ComplexRegion,
  ExtractedTemplate,
  ColorToken,
  FontToken,
  DesignSystem,
  PatchResult,
  DeleteResult,
  ReorderResult,
  ScreenshotResult,
} from "../shared/types.js";

// =============================================================================
// TEMPLATE EXTRACTION LOGIC
// =============================================================================

const DEFAULT_MAX_SLOT_DEPTH = 2;  // Default depth for slot capture

/**
 * Convert RGB to hex string
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Extract design system tokens from a captured template
 */
function extractDesignSystem(captured: CapturedNode): DesignSystem {
  const colorMap = new Map<string, ColorToken>();
  const fontMap = new Map<string, FontToken>();
  let cardPadding: number | undefined;
  let itemSpacing: number | undefined;
  let cardRadius: number | undefined;
  let containerRadius: number | undefined;
  
  function addColor(rgb: { r: number; g: number; b: number }, usage: string): void {
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (colorMap.has(hex)) {
      const existing = colorMap.get(hex)!;
      if (!existing.usage.includes(usage)) {
        existing.usage.push(usage);
      }
    } else {
      // Auto-name based on characteristics
      let name = 'color';
      if (rgb.r < 0.15 && rgb.g < 0.15 && rgb.b < 0.15) name = 'dark';
      else if (rgb.r > 0.9 && rgb.g > 0.9 && rgb.b > 0.9) name = 'light';
      else if (rgb.g > rgb.r && rgb.g > rgb.b) name = 'accent-green';
      else if (rgb.r > rgb.g && rgb.r > rgb.b) name = 'accent-red';
      else if (rgb.b > rgb.r && rgb.b > rgb.g) name = 'accent-blue';
      
      colorMap.set(hex, { name, rgb, hex, usage: [usage] });
    }
  }
  
  function addFont(family: string, style: string, size: number, usage: string): void {
    const key = `${family}|${style}`;
    if (fontMap.has(key)) {
      const existing = fontMap.get(key)!;
      if (!existing.sizes.includes(size)) {
        existing.sizes.push(size);
      }
      if (!existing.usage.includes(usage)) {
        existing.usage.push(usage);
      }
    } else {
      fontMap.set(key, { family, style, sizes: [size], usage: [usage] });
    }
  }
  
  function walk(node: CapturedNode, depth: number, context: string): void {
    // Extract colors from fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          addColor(fill.color, `${context}:fill`);
        }
      }
    }
    
    // Extract colors from strokes
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
          addColor(stroke.color, `${context}:stroke`);
        }
      }
    }
    
    // Extract font info from text nodes
    if (node.type === 'TEXT' && node.fontFamily && node.fontSize) {
      addFont(node.fontFamily, node.fontStyle || 'Regular', node.fontSize, context);
      
      // Also get text color
      if (node.fills) {
        for (const fill of node.fills) {
          if (fill.type === 'SOLID' && fill.color) {
            addColor(fill.color, `${context}:text`);
          }
        }
      }
    }
    
    // Extract spacing from Auto Layout frames
    if (node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE') {
      if (node.itemSpacing !== undefined) {
        itemSpacing = node.itemSpacing;
      }
      if (node.paddingTop !== undefined && node.paddingTop > 0) {
        cardPadding = node.paddingTop;
      }
    }
    
    // Extract corner radius
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      const nameLower = node.name.toLowerCase();
      if (nameLower.includes('card') || nameLower.includes('block')) {
        cardRadius = node.cornerRadius;
      } else {
        containerRadius = node.cornerRadius;
      }
    }
    
    // Recurse (but not too deep)
    if (node.children && depth < 3) {
      for (const child of node.children) {
        walk(child, depth + 1, child.name || context);
      }
    }
  }
  
  walk(captured, 0, captured.name);
  
  return {
    colors: Array.from(colorMap.values()),
    fonts: Array.from(fontMap.values()),
    spacing: { cardPadding, itemSpacing, slideMargin: 60 },
    corners: { cardRadius, containerRadius },
    background: captured.fills?.[0] || null,
  };
}

/**
 * Infer the role of a text node based on heuristics:
 * - Position (y < 200 = likely header area)
 * - Font size (large = headline, small = label/caption)
 * - Text content (ALL CAPS = section label)
 * - Parent name (contextual clues)
 */
function inferTextRole(
  node: CapturedNode,
  depth: number,
  parentName: string
): string {
  const text = node.characters || "";
  const fontSize = node.fontSize || 24;
  const y = node.y;
  const isAllCaps = text === text.toUpperCase() && text.length > 2;
  
  // Section label: small, near top, often ALL CAPS
  if (y < 200 && fontSize <= 24 && isAllCaps) {
    return "section_label";
  }
  
  // Headline: large, bold, upper portion
  if (fontSize >= 48 && y < 500) {
    return "headline";
  }
  
  // Subline/tagline: medium size, under headline position
  if (fontSize >= 28 && fontSize < 48 && y > 400 && y < 650) {
    return "subline";
  }
  
  // Number/stat: large number, often in a card
  if (/^\d+[%xX]?$/.test(text.trim()) || /^\$[\d,]+/.test(text.trim())) {
    return "stat_number";
  }
  
  // Card title: in a named container like "Card" or "Block"
  const parentLower = parentName.toLowerCase();
  if (parentLower.includes("card") || parentLower.includes("block") || parentLower.includes("point")) {
    if (fontSize >= 20 && text.length < 100) {
      return "card_title";
    }
    return "card_body";
  }
  
  // Caption/label: small text
  if (fontSize <= 18) {
    return "caption";
  }
  
  // Default: body text
  return "body_text";
}

/**
 * Infer the role of a frame based on heuristics:
 * - Name (explicit naming like "Card", "Header")
 * - Position
 * - Child count and types
 */
function inferFrameRole(node: CapturedNode, depth: number): string | null {
  const nameLower = node.name.toLowerCase();
  
  // Explicitly named structural frames
  if (nameLower.includes("card") || nameLower.includes("block")) {
    return "repeatable_card";
  }
  if (nameLower.includes("header") || nameLower.includes("label")) {
    return "header_container";
  }
  if (nameLower.includes("content") || nameLower.includes("body")) {
    return "content_container";
  }
  
  // Numbered frames (e.g., "01", "1") suggest repeatable items
  if (/^\d{1,2}$/.test(node.name.trim())) {
    return "numbered_item";
  }
  
  // Frames with Auto Layout at depth 1-2 are likely structural
  if (node.layoutMode && node.layoutMode !== "NONE" && depth <= 2) {
    return "layout_container";
  }
  
  return null;  // Not a slot-worthy frame
}

/**
 * Count total nodes in a subtree (for stats)
 */
function countNodes(node: CapturedNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * Extract a compact template from a captured node tree.
 * 
 * Strategy:
 * - Walk tree with depth tracking
 * - TEXT nodes at depth 1-maxDepth become slots
 * - Named frames (Card, Block, etc.) at depth 1-maxDepth become slots
 * - Subtrees at depth > maxDepth become complex_regions (bounds only)
 * 
 * @param captured - The full node tree from Figma
 * @param maxDepth - Maximum depth to capture as slots (default: 2). Increase for complex nested layouts.
 */
function extractTemplate(captured: CapturedNode, maxDepth: number = DEFAULT_MAX_SLOT_DEPTH): ExtractedTemplate {
  const slots: TemplateSlot[] = [];
  const complexRegions: ComplexRegion[] = [];
  let totalNodesInCapture = countNodes(captured);
  let nodesFiltered = 0;
  
  // Extract background from slide root
  let background: any = null;
  if (captured.fills && captured.fills.length > 0) {
    background = captured.fills[0];
  }
  
  /**
   * Recursive walker with depth tracking
   */
  function walk(node: CapturedNode, depth: number, parentName: string): void {
    // Skip the slide root itself (depth 0)
    if (depth === 0) {
      if (node.children) {
        for (const child of node.children) {
          walk(child, depth + 1, node.name);
        }
      }
      return;
    }
    
    // At depth > maxDepth, mark as complex region and stop
    if (depth > maxDepth) {
      const nodeCount = countNodes(node);
      // Only track complex regions if they have significant content
      if (nodeCount >= 3) {
        complexRegions.push({
          id: node.id,
          name: node.name,
          bounds: { x: node.x, y: node.y, width: node.width, height: node.height },
          nodeCount,
          reason: `depth=${depth}, too deep`,
        });
        nodesFiltered += nodeCount;
      }
      return;  // Don't recurse further
    }
    
    // TEXT nodes at depth 1-2 are slots
    if (node.type === "TEXT") {
      const role = inferTextRole(node, depth, parentName);
      
      // Extract fill color if solid
      let textColor: { r: number; g: number; b: number } | undefined;
      if (node.fills && node.fills.length > 0 && node.fills[0].type === "SOLID") {
        textColor = node.fills[0].color;
      }
      
      slots.push({
        id: node.id,
        role,
        depth,
        bounds: { x: node.x, y: node.y, width: node.width, height: node.height },
        text: {
          sample: (node.characters || "").substring(0, 50),
          fontSize: node.fontSize || 24,
          fontFamily: node.fontFamily || "Inter",
          fontStyle: node.fontStyle || "Regular",
          color: textColor,
        },
        parentName,
      });
      return;  // TEXT nodes have no children
    }
    
    // FRAME nodes: check if they should be a slot themselves
    if (node.type === "FRAME") {
      const frameRole = inferFrameRole(node, depth);
      
      if (frameRole) {
        // This frame is slot-worthy - capture its styling
        slots.push({
          id: node.id,
          role: frameRole,
          depth,
          bounds: { x: node.x, y: node.y, width: node.width, height: node.height },
          frame: {
            fills: node.fills || [],
            strokes: node.strokes || [],
            cornerRadius: node.cornerRadius,
            layoutMode: node.layoutMode,
            itemSpacing: node.itemSpacing,
          },
          parentName,
        });
      }
    }
    
    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        walk(child, depth + 1, node.name);
      }
    }
  }
  
  // Start walking from root
  walk(captured, 0, "");
  
  // Sort slots by position (top-left to bottom-right)
  slots.sort((a, b) => {
    // Group by rough Y position (within 50px = same row)
    const rowA = Math.floor(a.bounds.y / 50);
    const rowB = Math.floor(b.bounds.y / 50);
    if (rowA !== rowB) return rowA - rowB;
    return a.bounds.x - b.bounds.x;
  });
  
  return {
    source_slide_id: captured.id,
    source_slide_name: captured.name,
    slots,
    complex_regions: complexRegions,
    background,
    dimensions: { width: captured.width, height: captured.height },
    stats: {
      total_nodes_captured: totalNodesInCapture,
      slots_identified: slots.length,
      nodes_filtered: nodesFiltered,
    },
  };
}

// =============================================================================
// ARCHETYPE CONSTRAINTS
// =============================================================================

const ARCHETYPES: Record<
  string,
  {
    requiredFields: string[];
    constraints: Record<string, { maxWords?: number; maxItems?: number }>;
  }
> = {
  title: {
    requiredFields: ["headline"],
    constraints: {
      headline: { maxWords: 8 },
      subline: { maxWords: 15 },
    },
  },
  section: {
    requiredFields: ["headline"],
    constraints: {
      headline: { maxWords: 5 },
    },
  },
  "big-idea": {
    requiredFields: ["headline", "subline"],
    constraints: {
      headline: { maxWords: 12 },
      subline: { maxWords: 20 },
    },
  },
  bullets: {
    requiredFields: ["headline", "bullets"],
    constraints: {
      headline: { maxWords: 8 },
      bullets: { maxItems: 3 },
    },
  },
  "two-column": {
    requiredFields: ["headline", "left", "right"],
    constraints: {
      headline: { maxWords: 8 },
    },
  },
  quote: {
    requiredFields: ["quote", "attribution"],
    constraints: {
      quote: { maxWords: 30 },
    },
  },
  chart: {
    requiredFields: ["headline"],
    constraints: {
      headline: { maxWords: 10 },
      takeaway: { maxWords: 15 },
    },
  },
  timeline: {
    requiredFields: ["headline", "stages"],
    constraints: {
      headline: { maxWords: 8 },
      stages: { maxItems: 5 },
    },
  },
  comparison: {
    requiredFields: ["headline", "columns", "rows"],
    constraints: {
      headline: { maxWords: 8 },
      columns: { maxItems: 4 },
      rows: { maxItems: 5 },
    },
  },
  summary: {
    requiredFields: ["headline", "items"],
    constraints: {
      headline: { maxWords: 8 },
      items: { maxItems: 3 },
    },
  },
  "position-cards": {
    requiredFields: ["headline", "cards"],
    constraints: {
      eyebrow: { maxWords: 4 },
      headline: { maxWords: 15 },
      subline: { maxWords: 10 },
      cards: { maxItems: 3 },
    },
  },
  video: {
    requiredFields: ["headline", "video_url"],
    constraints: {
      headline: { maxWords: 10 },
      caption: { maxWords: 20 },
    },
  },
};

// =============================================================================
// VALIDATION
// =============================================================================

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function validateIR(ir: DeckIR): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const slide of ir.slides) {
    const archetype = ARCHETYPES[slide.archetype];

    if (!archetype) {
      warnings.push({
        slideId: slide.id,
        field: "archetype",
        message: `Unknown archetype: ${slide.archetype}`,
        severity: "error",
      });
      continue;
    }

    // Check required fields
    for (const field of archetype.requiredFields) {
      const value = slide.content[field as keyof SlideContent];
      if (value === undefined || value === null || value === "") {
        warnings.push({
          slideId: slide.id,
          field,
          message: `Missing required field: ${field}`,
          severity: "error",
        });
      }
    }

    // Check constraints
    for (const [field, constraint] of Object.entries(archetype.constraints)) {
      const value = slide.content[field as keyof SlideContent];

      if (value === undefined) continue;

      if (constraint.maxWords && typeof value === "string") {
        const wordCount = countWords(value);
        if (wordCount > constraint.maxWords) {
          warnings.push({
            slideId: slide.id,
            field,
            message: `${field} has ${wordCount} words (max ${constraint.maxWords})`,
            severity: "warning",
          });
        }
      }

      if (constraint.maxItems && Array.isArray(value)) {
        if (value.length > constraint.maxItems) {
          warnings.push({
            slideId: slide.id,
            field,
            message: `${field} has ${value.length} items (max ${constraint.maxItems})`,
            severity: "warning",
          });
        }
      }
    }
  }

  return warnings;
}

// =============================================================================
// IR STORAGE (in-memory for now, file-based later)
// =============================================================================

let currentIR: DeckIR | null = null;

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: "Monorail",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools (9 total)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "monorail_status",
        description:
          "Check if the Figma plugin is connected via WebSocket. Returns connection state and plugin info if connected.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "monorail_pull",
        description:
          "Pull deck state from Figma. Three modes:\n\n" +
          "1. **Full deck** (default): All slides with elements + containers. Use before bulk patching.\n" +
          "2. **Single slide** (slide_id param): One slide's full data. Use when you know which slide to edit.\n" +
          "3. **Summary** (mode:'summary'): Just slide IDs, names, archetypes. Use to see deck structure without element noise.\n\n" +
          "Returns Figma node IDs for patching. The 'containers' array shows where you can ADD new elements with action:'add'.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slide_id: {
              type: "string",
              description: "Optional: Figma node ID of a single slide to pull. Returns only that slide's data. Get IDs from a summary pull first.",
            },
            mode: {
              type: "string",
              enum: ["full", "summary"],
              description: "Output mode. 'full' (default) returns complete element data. 'summary' returns just slide IDs, names, and archetypes — fast way to see deck structure.",
            },
          },
        },
      },
      {
        name: "monorail_push",
        description:
          "Push IR to create/replace slides in Figma. Use for bootstrapping a new deck or bulk updates. For surgical edits to existing content, prefer pull → patch. Validates IR before sending (returns warnings for constraint violations).",
        inputSchema: {
          type: "object" as const,
          properties: {
            ir: {
              type: "string",
              description:
                "The deck IR as a JSON string. Each slide needs: id, archetype (title/section/big-idea/bullets/two-column/quote/chart/timeline/comparison/summary), status (draft/locked/stub), and content object.",
            },
            mode: {
              type: "string",
              enum: ["append", "replace"],
              description:
                "How to handle existing slides. 'append' (default) adds new slides after existing ones. 'replace' deletes ALL existing slides first, then creates new ones. Use 'replace' for full deck rewrites.",
            },
            autoApply: {
              type: "boolean",
              description:
                "If true (default), automatically render the slides in Figma. If false, just populates the plugin input field.",
            },
            start_index: {
              type: "number",
              description:
                "Position to insert new slides (0-based). Only applies in 'append' mode. If omitted, appends to end.",
            },
          },
          required: ["ir"],
        },
      },
      {
        name: "monorail_patch",
        description:
          "Edit, add, or delete elements. Three modes: (1) EDIT: target a TEXT node ID to update its content. (2) ADD: target a FRAME container ID (like 'bullets-container') with action:'add' to create a new element — inherits styling from siblings. (3) DELETE: target any element ID with action:'delete' to remove it. Get IDs from monorail_pull. Auto Layout reflows automatically after add/delete.",
        inputSchema: {
          type: "object" as const,
          properties: {
            patches: {
              type: "object",
              description: "The patch request with changes array",
              properties: {
                slide_id: {
                  type: "string",
                  description: "Optional slide ID for logging context",
                },
                changes: {
                  type: "array",
                  description: "Array of element patches",
                  items: {
                    type: "object",
                    properties: {
                      target: {
                        type: "string",
                        description: "Figma node ID — TEXT node for edit/delete, FRAME container for add",
                      },
                      text: {
                        type: "string",
                        description: "New text content (required for edit/add, ignored for delete)",
                      },
                      action: {
                        type: "string",
                        enum: ["edit", "add", "delete"],
                        description: "Action type: 'edit' (default) updates text, 'add' creates new element, 'delete' removes element",
                      },
                      position: {
                        type: "number",
                        description: "For 'add' only: insert position (0=first, -1 or omit=append at end)",
                      },
                    },
                    required: ["target"],
                  },
                },
              },
              required: ["changes"],
            },
          },
          required: ["patches"],
        },
      },
      {
        name: "monorail_capture",
        description:
          "Capture full node structure from a slide. Returns complete frame tree with positions, fills, strokes, Auto Layout, text styling. Also extracts design system tokens (colors, fonts, spacing) and identifies template slots. Use this to analyze existing designs before cloning. If important content appears in complex_regions, re-capture with higher max_depth.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slide_id: {
              type: "string",
              description:
                "Optional Figma node ID of slide to capture. If omitted, captures the currently selected slide (or first slide).",
            },
            max_depth: {
              type: "number",
              description:
                "Maximum nesting depth to capture as editable slots (default: 2). Increase to 3 or 4 for complex slides with nested cards/columns. Content deeper than this becomes complex_regions.",
            },
          },
        },
      },
      {
        name: "monorail_clone",
        description:
          "Clone a slide and update its text content. Creates a new slide that preserves all styling, positioning, and structure from the source — then updates specific text slots. Use capture first to identify slot IDs.",
        inputSchema: {
          type: "object" as const,
          properties: {
            source_slide_id: {
              type: "string",
              description:
                "The Figma node ID of the source slide to clone (from capture output)",
            },
            content_map: {
              type: "object",
              description:
                "Map of slot IDs to new text content. Keys are Figma node IDs, values are the new text.",
              additionalProperties: { type: "string" },
            },
          },
          required: ["source_slide_id"],
        },
      },
      {
        name: "monorail_delete",
        description:
          "Delete slides from the deck by their Figma node IDs. Use monorail_pull to get slide IDs first. This is destructive — slides are permanently removed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slide_ids: {
              type: "array",
              items: { type: "string" },
              description:
                "Array of Figma node IDs to delete (from figma_id field in pull output)",
            },
          },
          required: ["slide_ids"],
        },
      },
      {
        name: "monorail_reorder",
        description:
          "Reorder slides in the deck. Pass an array of Figma node IDs in the desired order. Slides will be rearranged to match this order.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slide_ids: {
              type: "array",
              items: { type: "string" },
              description:
                "Array of Figma node IDs in the desired order. All slides you want to keep must be included.",
            },
          },
          required: ["slide_ids"],
        },
      },
      {
        name: "monorail_screenshot",
        description:
          "Export a slide as a PNG image. Returns a base64-encoded image that can be displayed. Use this to see what Figma rendered — gives you 'eyes' to verify layouts, check alignment, spot issues. Can target a specific slide by ID or defaults to first slide.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slide_id: {
              type: "string",
              description:
                "Optional Figma node ID of the slide to screenshot. If omitted, exports the first slide.",
            },
            scale: {
              type: "number",
              description:
                "Export scale factor (default: 0.5 for 50% size). Use 1 for full resolution, 0.25 for small preview.",
            },
          },
        },
      },
      {
        name: "monorail_primitives",
        description:
          "Low-level design tool for creating slide content from scratch. Use this when you want to design a slide layout without using archetypes. Provide an array of operations (frames, text, shapes) that will be applied in sequence. Each operation can reference earlier operations by name for nesting.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slide_id: {
              type: "string",
              description:
                "Optional Figma node ID of an existing slide to add elements to. If omitted, creates a new slide.",
            },
            operations: {
              type: "array",
              description: "Array of primitive operations to apply in sequence",
              items: {
                type: "object",
                properties: {
                  op: {
                    type: "string",
                    enum: ["background", "frame", "auto_layout_frame", "text", "rect", "ellipse", "line", "path", "arrow"],
                    description: "Operation type. Use 'background' for slide backgrounds, 'line' for simple connectors with caps, 'path' for multi-point or curved lines.",
                  },
                  name: {
                    type: "string",
                    description: "Name for this element (can be referenced as parent by later operations)",
                  },
                  parent: {
                    type: "string",
                    description: "Parent element name (from earlier operation) or Figma ID. If omitted, adds to slide root.",
                  },
                  // Position
                  x: { type: "number", description: "X position (ignored for Auto Layout children)" },
                  y: { type: "number", description: "Y position (ignored for Auto Layout children)" },
                  // Dimensions
                  width: { type: "number", description: "Width (for rect, ellipse, frame)" },
                  height: { type: "number", description: "Height (for rect, ellipse, frame)" },
                  length: { type: "number", description: "Length (for line, arrow)" },
                  rotation: { type: "number", description: "Rotation in degrees (for line)" },
                  // Arrow properties
                  direction: { type: "string", description: "Arrow direction: 'right', 'left', 'up', 'down', or degrees (for arrow). Also used for Auto Layout: 'VERTICAL', 'HORIZONTAL'" },
                  headSize: { type: "number", description: "Arrowhead size in pixels (default: 12)" },
                  bidirectional: { type: "boolean", description: "If true, arrow has heads on both ends" },
                  // Text properties
                  text: { type: "string", description: "Text content (for text op)" },
                  fontSize: { type: "number", description: "Font size in pixels (for text op)" },
                  bold: { type: "boolean", description: "Bold font (for text op)" },
                  maxWidth: { type: "number", description: "Maximum width before wrapping (for text op)" },
                  // Colors (named: 'headline', 'body', 'muted', 'cyan', 'orange', 'green', 'pink', 'red', 'yellow', hex '#1a1a2e', or {r,g,b})
                  color: { type: "string", description: "Color for text, line, or arrow" },
                  fill: { type: "string", description: "Fill color for solid backgrounds and shapes" },
                  stroke: { type: "string", description: "Stroke color for shapes" },
                  // Gradient (for background op only)
                  gradient: {
                    type: "object",
                    description: "Gradient fill (for background op). Use instead of 'fill' for gradient backgrounds.",
                    properties: {
                      type: { type: "string", enum: ["linear", "radial"], description: "Gradient type (default: linear)" },
                      angle: { type: "number", description: "Angle in degrees. 0=left-to-right, 90=top-to-bottom (default: 90)" },
                      stops: {
                        type: "array",
                        description: "Color stops. Each has 'position' (0-1) and 'color' (hex or named)",
                        items: {
                          type: "object",
                          properties: {
                            position: { type: "number", description: "Position from 0 (start) to 1 (end)" },
                            color: { type: "string", description: "Color at this stop (hex or named)" }
                          },
                          required: ["position", "color"]
                        }
                      }
                    },
                    required: ["stops"]
                  },
                  strokeWeight: { type: "number", description: "Stroke width (for line)" },
                  // Line caps (for line op - simpler than vector arrow)
                  startCap: { 
                    type: "string", 
                    enum: ["NONE", "ROUND", "SQUARE", "ARROW_LINES", "ARROW_EQUILATERAL", "TRIANGLE_FILLED", "DIAMOND_FILLED", "CIRCLE_FILLED"],
                    description: "Start cap decoration (for line op). Use ARROW_EQUILATERAL for simple arrows."
                  },
                  endCap: { 
                    type: "string", 
                    enum: ["NONE", "ROUND", "SQUARE", "ARROW_LINES", "ARROW_EQUILATERAL", "TRIANGLE_FILLED", "DIAMOND_FILLED", "CIRCLE_FILLED"],
                    description: "End cap decoration (for line/path op). Use ARROW_EQUILATERAL for simple arrows."
                  },
                  // Path properties
                  points: {
                    type: "array",
                    description: "Array of {x, y} points for path op. Minimum 2 points.",
                    items: {
                      type: "object",
                      properties: {
                        x: { type: "number", description: "X coordinate" },
                        y: { type: "number", description: "Y coordinate" }
                      },
                      required: ["x", "y"]
                    }
                  },
                  smooth: { type: "boolean", description: "For path: auto-generate smooth bezier curves between points" },
                  closed: { type: "boolean", description: "For path: connect last point back to first (creates a closed shape)" },
                  cornerRadius: { type: "number", description: "Corner radius (for rect)" },
                  // Auto Layout properties
                  spacing: { type: "number", description: "Item spacing in Auto Layout (default: 24)" },
                  padding: { type: "number", description: "Uniform padding in Auto Layout" },
                },
                required: ["op"],
              },
            },
          },
          required: ["operations"],
        },
      },
    ],
  };
});

// Handle tool calls (10 total)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // =========================================================================
    // monorail_status - Check plugin connection
    // =========================================================================
    case "monorail_status": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Figma plugin connected\n  Plugin: ${pluginInfo.name || "unknown"}\n  Version: ${pluginInfo.version || "unknown"}\n  Connected at: ${pluginInfo.connectedAt || "unknown"}\n  WebSocket server: ws://localhost:${WS_PORT}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: `✗ No plugin connected\n  WebSocket server: ws://localhost:${WS_PORT} (listening)\n\nTo connect:\n1. Open Figma Slides\n2. Run the Monorail plugin\n3. Plugin will auto-connect on open`,
            },
          ],
        };
      }
    }

    // =========================================================================
    // monorail_pull - Get deck state from Figma
    // =========================================================================
    case "monorail_pull": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;

      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      // Check if there's already a pending pull request
      if (hasPendingRequest('pull')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another pull request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Parse optional params
      const slideIdFilter = args?.slide_id as string | undefined;
      const mode = (args?.mode as string) || "full";

      // Create pending request and send to plugin
      const pullPromise = createPendingRequest<DeckIR>('pull', "Timeout waiting for plugin export");
      connectedPlugin!.send(JSON.stringify({ type: "request-export" }));

      try {
        const ir = await pullPromise;
        
        // Update currentIR in server state
        currentIR = ir;

        const deckName = ir.deck?.title || "Untitled Deck";
        const slideCount = ir.slides?.length || 0;

        // =================================================================
        // MODE: SUMMARY — compact deck overview
        // =================================================================
        if (mode === "summary") {
          let summary = `✓ Pulled "${deckName}" summary (${slideCount} slides)\n\n`;
          summary += `| #  | Figma ID | Name                    | Archetype     |\n`;
          summary += `|----|----------|-------------------------|---------------|\n`;
          
          ir.slides.forEach((slide, idx) => {
            const name = (slide.content?.headline || slide.id || "Untitled").substring(0, 23).padEnd(23);
            const arch = slide.archetype.padEnd(13);
            const num = String(idx + 1).padStart(2);
            summary += `| ${num} | ${slide.figma_id?.padEnd(8) || "        "} | ${name} | ${arch} |\n`;
          });

          // Include containers in summary if present
          const containerCount = ir.containers?.length || 0;
          if (containerCount > 0) {
            summary += `\n## Addable Containers (${containerCount})\n`;
            for (const c of ir.containers!) {
              summary += `  • ${c.name} (${c.id}) in "${c.slide_name}"\n`;
            }
          }

          summary += `\nTip: Use slide_id param to pull full details for a specific slide.`;

          return {
            content: [{ type: "text" as const, text: summary }],
          };
        }

        // =================================================================
        // MODE: SINGLE SLIDE — filter to one slide
        // =================================================================
        if (slideIdFilter) {
          const slide = ir.slides.find(s => s.figma_id === slideIdFilter);
          
          if (!slide) {
            return {
              content: [{
                type: "text" as const,
                text: `Error: Slide not found with figma_id "${slideIdFilter}". Use mode:'summary' to see available slide IDs.`,
              }],
              isError: true,
            };
          }

          const elementCount = slide.elements?.length || 0;
          const slideName = slide.content?.headline || slide.id || "Untitled";
          
          // Find containers for this slide
          const slideContainers = ir.containers?.filter(c => c.slide_id === slideIdFilter) || [];
          
          let summary = `✓ Pulled slide "${slideName}" (${slideIdFilter})\n`;
          summary += `  ${elementCount} elements`;
          
          if (slideContainers.length > 0) {
            summary += `, ${slideContainers.length} addable container${slideContainers.length > 1 ? 's' : ''}\n\n`;
            summary += `## Addable Containers (use with action: "add")\n`;
            for (const c of slideContainers) {
              summary += `  • ${c.name} (${c.id}) - ${c.child_count} ${c.element_type}s\n`;
              summary += `    ${c.hint}\n`;
            }
          } else {
            summary += `\n`;
          }

          // Return filtered IR with just this slide
          const filteredIr: DeckIR = {
            deck: ir.deck,
            slides: [slide],
            containers: slideContainers.length > 0 ? slideContainers : undefined,
          };

          return {
            content: [{
              type: "text" as const,
              text: `${summary}\n${JSON.stringify(filteredIr, null, 2)}`,
            }],
          };
        }

        // =================================================================
        // MODE: FULL — complete deck data (default)
        // =================================================================
        const containerCount = ir.containers?.length || 0;
        
        let summary = `✓ Pulled "${deckName}" from Figma\n`;
        summary += `  ${slideCount} slides`;
        
        // Highlight containers if present (key for action: "add")
        if (containerCount > 0) {
          summary += `, ${containerCount} addable containers\n\n`;
          summary += `## Addable Containers (use with action: "add")\n`;
          for (const c of ir.containers!) {
            summary += `  • ${c.name} (${c.id}) - ${c.child_count} ${c.element_type}s in "${c.slide_name}"\n`;
            summary += `    ${c.hint}\n`;
          }
          summary += `\n`;
        } else {
          summary += `\n\n`;
        }

        // Tip for large decks
        if (slideCount > 10) {
          summary += `Tip: For large decks, use mode:'summary' to see structure, then slide_id to pull specific slides.\n\n`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `${summary}${JSON.stringify(ir, null, 2)}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error pulling from plugin: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_push - Create/replace slides in Figma (with inline validation)
    // =========================================================================
    case "monorail_push": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const irString = args?.ir as string;
      if (!irString) {
        return {
          content: [{ type: "text" as const, text: "Error: No IR provided" }],
          isError: true,
        };
      }

      let ir: DeckIR;
      try {
        ir = JSON.parse(irString);
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to parse IR JSON - ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }

      // Inline validation (was separate monorail_validate_ir tool)
      const warnings = validateIR(ir);
      const errors = warnings.filter((w) => w.severity === "error");
      
      // Block on errors, warn on warnings
      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: IR validation failed with ${errors.length} errors:\n\n${errors.map((w) => `- ${w.slideId}: ${w.message}`).join("\n")}\n\nFix these issues and try again.`,
            },
          ],
          isError: true,
        };
      }

      const autoApply = args?.autoApply !== false; // Default to true
      const mode = (args?.mode as string) || "append"; // Default to append for backwards compatibility
      const startIndex = args?.start_index as number | undefined;

      // Send to plugin
      connectedPlugin!.send(
        JSON.stringify({
          type: "push-ir",
          ir: ir,
          autoApply: autoApply,
          mode: mode,
          startIndex: mode === "append" ? startIndex : undefined, // startIndex only applies in append mode
        })
      );

      // Also update currentIR in server state
      currentIR = ir;

      const warningText = warnings.length > 0
        ? `\n\nWarnings:\n${warnings.map((w) => `- ${w.slideId}: ${w.message}`).join("\n")}`
        : "";
      
      const modeText = mode === "replace" ? " (replaced existing deck)" : "";
      const positionText = mode === "append" && startIndex !== undefined
        ? ` at position ${startIndex}`
        : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `✓ Pushed ${ir.slides.length} slides to Figma${modeText}${positionText}${warningText}`,
          },
        ],
      };
    }

    // =========================================================================
    // monorail_patch - Update specific elements by node ID
    // =========================================================================
    case "monorail_patch": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const patches = args?.patches as { slide_id?: string; changes: { target: string; text: string }[] };
      if (!patches || !patches.changes || patches.changes.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Error: No patches provided" }],
          isError: true,
        };
      }

      // Check if there's already a pending patch request
      if (hasPendingRequest('patch')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another patch request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin
      const patchPromise = createPendingRequest<PatchResult>('patch', "Timeout waiting for patch result");
      connectedPlugin!.send(JSON.stringify({ type: "patch-elements", patches }));

      try {
        const result = await patchPromise;

        // Build summary
        const parts: string[] = [];
        if (result.updated > 0) parts.push(`${result.updated} edited`);
        if (result.added > 0) parts.push(`${result.added} added`);
        if (result.deleted > 0) parts.push(`${result.deleted} deleted`);

        // Provide actionable guidance for failures
        let failedText = "";
        if (result.failed.length > 0) {
          failedText = `\n\n⚠️ Failed: ${result.failed.join(", ")}`;
          failedText += `\n   Node IDs may be stale. Try: monorail_pull to get fresh IDs, then retry.`;
          failedText += `\n   Common causes: slide was recreated, elements were deleted, or wrong slide targeted.`;
        }

        const newElementsText = result.newElements && result.newElements.length > 0
          ? `\n\nNew elements:\n${result.newElements.map((e: {id: string; name: string; container: string}) => `- ${e.name} (${e.id}) in ${e.container}`).join("\n")}`
          : "";

        const deletedElementsText = result.deletedElements && result.deletedElements.length > 0
          ? `\n\nDeleted elements:\n${result.deletedElements.map((e: {id: string; name: string; container: string}) => `- ${e.name} (${e.id}) from ${e.container}`).join("\n")}`
          : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Patched: ${parts.join(", ") || "no changes"}${newElementsText}${deletedElementsText}${failedText}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error patching elements: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_capture - Capture slide structure + design system + slots
    // =========================================================================
case "monorail_capture": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;

      // Extract parameters
      const maxDepth = typeof request.params?.arguments?.max_depth === 'number'
        ? request.params.arguments.max_depth
        : DEFAULT_MAX_SLOT_DEPTH;
      const slideId = typeof request.params?.arguments?.slide_id === 'string'
        ? request.params.arguments.slide_id
        : undefined;

      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      // Check if there's already a pending capture request
      if (hasPendingRequest('capture')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another capture request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin (with optional slideId and maxDepth)
      const capturePromise = createPendingRequest<CapturedTemplate>('capture', "Timeout waiting for template capture");
      connectedPlugin!.send(JSON.stringify({ type: "capture-template", slideId, maxDepth }));

      try {
        const result = await capturePromise;
        
        // Parse the captured template
        const captured: CapturedNode = typeof result.template === 'string' 
          ? JSON.parse(result.template) 
          : result.template;
        
        // Extract template slots with configurable depth
        const template = extractTemplate(captured, maxDepth);
        
        // Extract design system (merged from monorail_extract_design_system)
        const designSystem = extractDesignSystem(captured);
        
        // Build comprehensive output
        const output = {
          slide_id: captured.id,
          slide_name: captured.name,
          dimensions: { width: captured.width, height: captured.height },
          
          // Design system tokens
          design_system: {
            colors: designSystem.colors,
            fonts: designSystem.fonts,
            spacing: designSystem.spacing,
            corners: designSystem.corners,
          },
          
          // Template slots (text nodes and frames that can be updated)
          slots: template.slots.map(s => ({
            id: s.id,
            role: s.role,
            text: s.text?.sample,
            bounds: s.bounds,
          })),
          
          // Complex regions (diagrams, charts - not editable via clone)
          complex_regions: template.complex_regions,
          
          // Stats
          stats: {
            total_nodes: result.nodeCount,
            slots_found: template.slots.length,
            colors_found: designSystem.colors.length,
            fonts_found: designSystem.fonts.length,
            max_depth_used: maxDepth,
          },
        };
        
        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Captured "${captured.name}" (${result.nodeCount} nodes, max_depth: ${maxDepth})

**Design System:**
- Colors: ${designSystem.colors.map(c => c.hex).join(', ')}
- Fonts: ${designSystem.fonts.map(f => `${f.family} ${f.style}`).join(', ')}

**Slots (${template.slots.length}):**
${template.slots.map(s => `- [${s.role}] ${s.id}: "${s.text?.sample || '(frame)'}"`).join('\n')}

**Complex Regions:** ${template.complex_regions.length > 0 ? template.complex_regions.map(r => r.name).join(', ') : 'none'}${template.complex_regions.length > 0 ? `\n(Tip: Re-capture with higher max_depth to access nested content)` : ''}

\`\`\`json
${JSON.stringify(output, null, 2)}
\`\`\``,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error capturing template: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_clone - Clone slide and update content
    // =========================================================================
    case "monorail_clone": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const sourceSlideId = args?.source_slide_id as string;
      const contentMap = args?.content_map as Record<string, string>;

      if (!sourceSlideId) {
        return {
          content: [{ type: "text" as const, text: "Error: No source_slide_id provided" }],
          isError: true,
        };
      }

      // Check if there's already a pending instantiate request
      if (hasPendingRequest('instantiate')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another clone request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin
      const instantiatePromise = createPendingRequest<InstantiateResult>('instantiate', "Timeout waiting for clone");
      connectedPlugin!.send(JSON.stringify({ 
        type: "instantiate-template", 
        sourceId: sourceSlideId,
        contentMap: contentMap || {}
      }));

      try {
        const result = await instantiatePromise;
        
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating slide: ${result.error}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Created new slide from template

**New slide ID:** ${result.newSlideId}
**Text slots updated:** ${result.updated}
${result.failed && result.failed.length > 0 ? `**Failed:** ${result.failed.join(", ")}\n` : ""}${result.fontSubstitutions && result.fontSubstitutions.length > 0 ? `**Font substitutions:** ${result.fontSubstitutions.join(", ")}\n` : ""}
The new slide has been selected in Figma.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error instantiating template: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_delete - Delete slides by ID
    // =========================================================================
    case "monorail_delete": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const slideIds = args?.slide_ids as string[];
      if (!slideIds || slideIds.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Error: No slide_ids provided" }],
          isError: true,
        };
      }

      // Check if there's already a pending delete request
      if (hasPendingRequest('delete')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another delete request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin
      const deletePromise = createPendingRequest<DeleteResult>('delete', "Timeout waiting for delete result");
      connectedPlugin!.send(JSON.stringify({ type: "delete-slides", slideIds }));

      try {
        const result = await deletePromise;
        
        const failedText = result.failed.length > 0 
          ? `\n\nFailed to delete: ${result.failed.join(", ")}`
          : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Deleted ${result.deleted} slides${failedText}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error deleting slides: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_reorder - Reorder slides
    // =========================================================================
    case "monorail_reorder": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const slideIds = args?.slide_ids as string[];
      if (!slideIds || slideIds.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Error: No slide_ids provided" }],
          isError: true,
        };
      }

      // Check if there's already a pending reorder request
      if (hasPendingRequest('reorder')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another reorder request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin
      const reorderPromise = createPendingRequest<ReorderResult>('reorder', "Timeout waiting for reorder result");
      connectedPlugin!.send(JSON.stringify({ type: "reorder-slides", slideIds }));

      try {
        const result = await reorderPromise;
        
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error reordering slides: ${result.error}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Reordered ${result.count} slides`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reordering slides: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_screenshot - Export slide as PNG image
    // =========================================================================
    case "monorail_screenshot": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const slideId = args?.slide_id as string | undefined;
      const scale = (args?.scale as number) || 0.5;

      // Check if there's already a pending screenshot request
      if (hasPendingRequest('screenshot')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another screenshot request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin
      const screenshotPromise = createPendingRequest<ScreenshotResult>('screenshot', "Timeout waiting for screenshot");
      connectedPlugin!.send(JSON.stringify({ type: "request-screenshot", slideId, scale }));

      try {
        const result = await screenshotPromise;
        
        if (!result.success || !result.base64) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error taking screenshot: ${result.error || "No image data returned"}`,
              },
            ],
            isError: true,
          };
        }

        const sizeKB = Math.round((result.base64.length * 3 / 4) / 1024);

        return {
          content: [
            {
              type: "text" as const,
              text: `📷 Screenshot of "${result.slideName}" (${result.width}×${result.height}, ${sizeKB}KB)`,
            },
            {
              type: "image" as const,
              data: result.base64,
              mimeType: "image/png",
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error taking screenshot: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_primitives - Low-level design operations
    // =========================================================================
    case "monorail_primitives": {
      const isConnected = connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;

      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No Figma plugin connected. Open Figma Slides and run the Monorail plugin first.",
            },
          ],
          isError: true,
        };
      }

      const slideId = args?.slide_id as string | undefined;
      const operations = args?.operations as any[];

      if (!operations || operations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No operations provided. The 'operations' array is required.",
            },
          ],
          isError: true,
        };
      }

      // Check if there's already a pending primitives request
      if (hasPendingRequest('primitives')) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Another primitives request is already in progress. Please wait.",
            },
          ],
          isError: true,
        };
      }

      try {
        // Create promise for response
        const resultPromise = createPendingRequest<{
          success: boolean;
          slideId?: string;
          slideName?: string;
          created?: Array<{ name: string; id: string; type: string }>;
          error?: string;
        }>('primitives', 'Primitives request timed out');

        // Send to plugin
        connectedPlugin!.send(JSON.stringify({
          type: 'apply-primitives',
          slideId,
          operations,
        }));

        // Wait for response
        const result = await resultPromise;

        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${result.error || "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }

        // Build success response
        const createdList = result.created?.map(n => `  - ${n.name} (${n.type}): ${n.id}`).join('\n') || '';
        
        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Created ${result.created?.length || 0} elements on "${result.slideName}" (${result.slideId})

**Created nodes:**
${createdList}

**Tip:** Use \`monorail_screenshot\` to see the result, or \`monorail_patch\` to edit text nodes by ID.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error applying primitives: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "monorail://skill",
        name: "Monorail Narrative Skill",
        description:
          "Thinking toolkit for creating decks with narrative coherence. Use when helping users create presentations.",
        mimeType: "text/markdown",
      },
      {
        uri: "monorail://archetypes",
        name: "Slide Archetypes",
        description:
          "The 11 constrained slide templates with word limits and usage guidance.",
        mimeType: "text/markdown",
      },
      {
        uri: "monorail://ir-format",
        name: "IR Format Reference",
        description:
          "The intermediate representation format for defining decks.",
        mimeType: "text/markdown",
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  const resourceContent: Record<string, string> = {
    "monorail://skill": `# Monorail Narrative Skill

When creating presentation decks, focus on:

1. **Argument over information** - Every deck needs a point of view
2. **One idea per slide** - Cognitive load matters
3. **Headlines that assert** - Not "Q3 Results" but "Q3 exceeded targets by 40%"
4. **Progressive disclosure** - Build the argument slide by slide
5. **End with action** - What should happen next?

## The Monorail Process

1. Understand the brief (who, what, why)
2. Find the argument (what's the one thing?)
3. Structure the arc (setup → tension → resolution)
4. Draft slides using archetypes
5. **Verify with screenshots** - Use monorail_screenshot to see what you rendered
6. Iterate with feedback

## Visual QA Workflow

You have "eyes" now! Use \`monorail_screenshot\` to see what Figma actually renders:

\`\`\`
1. monorail_push    → create/update slides
2. monorail_screenshot → see the result as an image
3. (spot issues? fix and iterate)
\`\`\`

**When to screenshot:**
- After creating new slides (verify layout)
- After patching content (check text fits)
- When user reports visual issues (see what they see)
- Before presenting work to user (QA check)

**Tip:** Use \`scale: 0.5\` (default) for quick checks, \`scale: 1\` for full resolution.

## Design Principles (for \`monorail_primitives\`)

When designing slides from scratch, follow these spatial and visual guidelines.

### Background (Solid or Gradient)

**Always use \`op: "background"\` to set the slide's background.** This sets the slide's native background property.

**Solid color:**
\`\`\`json
{ "op": "background", "fill": "#0f0f1a" }
\`\`\`

**Linear gradient (top-to-bottom fade):**
\`\`\`json
{ "op": "background", "gradient": {
    "angle": 90,
    "stops": [
      { "position": 0, "color": "#1a1a2e" },
      { "position": 1, "color": "#0a0a14" }
    ]
  }
}
\`\`\`

**Radial gradient (spotlight effect):**
\`\`\`json
{ "op": "background", "gradient": {
    "type": "radial",
    "stops": [
      { "position": 0, "color": "#2a2a4e" },
      { "position": 1, "color": "#0f0f1a" }
    ]
  }
}
\`\`\`

**Never use \`op: "rect"\` for backgrounds.** A rect creates a shape layer that sits ON TOP of the slide's existing background, causing layering issues.

### Arrows and Connectors

**For simple arrows, use \`line\` with \`endCap\`:**
\`\`\`json
{ "op": "line", "x": 100, "y": 200, "length": 150, "endCap": "ARROW_EQUILATERAL", "strokeWeight": 3, "color": "cyan" }
\`\`\`

**Different caps on each end:**
\`\`\`json
{ "op": "line", "length": 200, "startCap": "CIRCLE_FILLED", "endCap": "ARROW_EQUILATERAL", "color": "pink" }
\`\`\`

**Available caps:** \`ARROW_EQUILATERAL\` (filled triangle), \`ARROW_LINES\` (open arrow), \`TRIANGLE_FILLED\`, \`DIAMOND_FILLED\`, \`CIRCLE_FILLED\`, \`ROUND\`, \`SQUARE\`

**Use \`rotation\` for direction:** 0=right, 90=down, 180=left, -90=up

**When to use \`arrow\` op instead:** Only for custom head sizes. The \`line\` with caps handles single-direction and bidirectional connectors.

### Multi-Point Paths

**For complex connectors or shapes, use \`path\`:**

**Zigzag connector with arrow:**
\`\`\`json
{ "op": "path", "points": [{"x": 0, "y": 0}, {"x": 150, "y": 80}, {"x": 300, "y": 0}], "endCap": "ARROW_EQUILATERAL", "color": "cyan" }
\`\`\`

**Smooth curved path:**
\`\`\`json
{ "op": "path", "points": [...], "smooth": true, "color": "orange" }
\`\`\`

**Closed filled shape (organic blob):**
\`\`\`json
{ "op": "path", "points": [{"x": 0, "y": 0}, {"x": 100, "y": -60}, {"x": 200, "y": 0}, {"x": 100, "y": 60}], "smooth": true, "closed": true, "fill": "green" }
\`\`\`

**Path options:** \`smooth\` (auto-bezier), \`closed\` (connect last to first), \`startCap\`/\`endCap\` (arrow decorations)

### Canvas Dimensions
- Slide: 1920 × 1080 pixels
- Safe margins: 80-160px from edges
- Visual center: approximately (960, 500) — slightly above geometric center

### Vertical Zone Planning (CRITICAL)

**Before placing any elements, plan how content fills the full 1080px height.**

Slides that cram content into the top half with empty bottom space look unfinished.

**Standard 4-zone layout:**
\`\`\`
Zone 1: TITLE        y=50-180    (~130px)  - headline, subtitle
Zone 2: MAIN         y=200-650   (~450px)  - cards, diagrams, core content  
Zone 3: SECONDARY    y=670-830   (~160px)  - callouts, supporting info
Zone 4: TAKEAWAY     y=850-1000  (~150px)  - punchline, anchors the bottom
\`\`\`

**Key insight:** Size elements to FILL their zone, not just fit their content.
- Cards should be 350-450px tall, not 200px
- Bottom text should anchor near y=900, not float at y=600

**Anti-pattern:** Stacking content top-down without planning → empty bottom third
**Correct approach:** Plan zones first, then size elements to fill them

### Positioning Patterns

**Centered content (quotes, big ideas):**
\`\`\`
x = 120-160 (left margin)
y = 400-450 (vertical center, not 1/3 down!)
\`\`\`

**Top-anchored content (bullets, columns):**
\`\`\`
Headline: y = 100-140
Content start: y = 220-280
\`\`\`

**Split layouts (agenda, two-panel):**
\`\`\`
Left panel: x = 40-80, width = 500-600
Right content: x = 680-720
\`\`\`

### Typography Scale

**CRITICAL: Nothing below 24px. Ever.** If text seems too large, edit the copy shorter instead.

| Role | Size | Weight | Color |
|------|------|--------|-------|
| Hero number | 96-180px | Bold | accent (cyan/orange) |
| Headline | 56-72px | Bold | \`headline\` |
| Title | 32-48px | Bold | \`white\` |
| Body | 24-32px | Regular | \`body\` |
| Caption/Label | 24px | Bold | \`muted\` or accent |
| Eyebrow | 24px | Bold | accent (cyan) |

### Word Economy

- Every word must earn its place
- "Ship utility" not "Ship something real"
- If you can say it in 2 words, don't use 3
- Constraint breeds clarity — shorter copy = larger fonts = better readability

### Rhythm Through Line Breaks

For body text in cards, use line breaks to create rhythm:
\`\`\`
We push.
We reach out.
We pitch.
We earn every conversation.
\`\`\`

One phrase per line. More scannable than paragraphs.

### Text-in-Box Pattern

When placing text inside a rectangle, **bind the text dimensions to the box**:

\`\`\`json
[
  { "op": "rect", "name": "card", "x": 100, "y": 300, "width": 200, "height": 100, "fill": "#1a1a2e", "cornerRadius": 12 },
  { "op": "text", "name": "card-text", "text": "SOLVE\\nShip utility", "x": 116, "y": 316, "width": 168, "height": 68, "fontSize": 24, "bold": true, "alignment": "CENTER", "verticalAlignment": "CENTER" }
]
\`\`\`

The pattern:
1. Box at (x, y) with (width, height)
2. Text at (x + margin, y + margin) with (width - 2×margin, height - 2×margin)
3. Set \`alignment: "CENTER"\` and \`verticalAlignment: "CENTER"\`

**Standard margin: 16px.** Text is now bounded and centered — it cannot escape.

**Never** place text by guessing center coordinates. **Always** bind text dimensions to container dimensions.

### Cards: Use Sparingly

Cards (bordered/filled boxes) should group related content, not decorate.
- If text has good spacing, it doesn't need a box
- Plain text with good spacing often works better
- Remove cards that don't add grouping value

### Trust the Background

- Slide backgrounds provide contrast
- Don't add rectangles unless grouping content
- Let text breathe directly on gradient/color

### Spacing Rules

| Context | Spacing |
|---------|---------|
| Between sections | 80-120px |
| Between cards/columns | 40-60px |
| Within text stack | 16-24px (use Auto Layout \`spacing\`) |
| Card padding | 24-40px |
| Accent bar height | 6-8px (4px is too subtle) |

### Color Usage

| Purpose | Color |
|---------|-------|
| Headlines, emphasis | \`headline\` (warm cream) |
| Body text | \`body\` (light gray) |
| Secondary text | \`muted\` (gray) |
| Accent/highlight | \`cyan\`, \`orange\`, \`green\` |
| Borders | \`cyan\` or \`blue\` |
| Backgrounds | \`bg\`, \`cardBg\`, or RGB |

### Common Patterns

**Stats slide:**
\`\`\`
- Big numbers: 96px, colored (cyan/orange/green)
- Labels below: 24px muted
- Horizontal layout with 80-120px gaps
\`\`\`

**Three-column:**
\`\`\`
- Columns: ~480px wide each
- Gap: 40px
- Accent bar at top of each: 6-8px height
- Auto Layout: VERTICAL per column, HORIZONTAL for row
\`\`\`

**Quote:**
\`\`\`
- Quote: 48px, headline color, centered vertically (y ≈ 400-450)
- Attribution: 28px muted, below quote
- Use Auto Layout with 40px spacing
\`\`\`

### Self-Critique Checklist

After \`monorail_screenshot\`, ask yourself:

- [ ] **Vertical fill:** Does content span from top (~60) to bottom (~900)? Empty bottom third = redo layout
- [ ] **Typography minimum:** Is ALL text ≥24px? (If not, shorten the copy)
- [ ] **Text containment:** Is text staying inside its boxes? (If not, use text-in-box pattern)
- [ ] **Centering:** Is it optically balanced, not top-heavy?
- [ ] **Breathing room:** Are there comfortable margins (80-160px)?
- [ ] **Hierarchy:** Is it clear what to read first?
- [ ] **Empty space:** Is there awkward emptiness anywhere?
- [ ] **Edge safety:** Is anything too close to being clipped?
- [ ] **Word economy:** Can any text be shorter while keeping meaning?

**Most common mistake:** Content crammed in top half, bottom third empty.
**Fix:** Plan vertical zones BEFORE placing elements. Size cards/containers to fill zones.

If any answer is "no", use \`monorail_primitives\` with the same \`slide_id\` to add fixes, or \`monorail_patch\` to adjust text.

### When to Use What

| Need | Tool | Quality |
|------|------|---------|
| Quick draft, exploration | \`monorail_primitives\` | 80% |
| Standard layouts | \`monorail_push\` (archetypes) | 90% |
| Production fidelity | \`monorail_clone\` | 100% |

Primitives = creative freedom. Archetypes = speed. Clone = perfection.
`,

    "monorail://archetypes": `# Slide Archetypes

## title
Opening slide. Sets the tone.
- headline: ≤8 words
- subline: ≤15 words (optional)

## section
Divider between sections.
- headline: ≤5 words

## big-idea
Central insight. Use sparingly.
- headline: ≤12 words
- subline: ≤20 words

## bullets
List of points. Max 3 bullets.
- headline: ≤8 words
- bullets: max 3, each ≤10 words

## two-column
Compare/contrast or parallel ideas.
- headline: ≤8 words
- left: { title, body }
- right: { title, body }

## quote
Testimonial or provocative statement.
- quote: ≤30 words
- attribution: name/source

## chart
Data visualization with insight.
- headline: ≤10 words (states the insight!)
- chart: { type, placeholder }
- takeaway: ≤15 words

## timeline
Sequential stages or milestones.
- headline: ≤8 words
- stages: 3-5 items with label + description

## comparison
Table comparing options/features.
- headline: ≤8 words
- columns: 2-4 headers
- rows: 3-5 data rows

## summary
Closing slide with key takeaways.
- headline: ≤8 words
- items: max 3, each ≤12 words

## position-cards
Strategic positioning with 3-column cards. Use for product pillars, frameworks.
- eyebrow: ≤4 words (cyan label above headline)
- headline: ≤15 words
- subline: ≤10 words
- cards: exactly 3, each with:
  - label: category name (e.g., "THE FOUNDATION")
  - title: short title (e.g., "Identity")
  - body: description (2 lines max)
  - badge: status text (e.g., "✓ Built")
  - badge_color: green | cyan | orange
- features: array of { label, description } for bottom row (optional)

Example:
\`\`\`json
{
  "archetype": "position-cards",
  "content": {
    "eyebrow": "OUR POSITION",
    "headline": "Identity is the pillar. ACP is north.",
    "subline": "The wedge shows us what's next.",
    "cards": [
      { "label": "THE FOUNDATION", "title": "Identity", "body": "Description here.", "badge": "✓ Built", "badge_color": "green" },
      { "label": "THE DIRECTION", "title": "Control Plane", "body": "Description here.", "badge": "North Star", "badge_color": "cyan" },
      { "label": "THE GOAL", "title": "Customer Needs", "body": "Description here.", "badge": "Our Guide", "badge_color": "orange" }
    ],
    "features": [
      { "label": "Feature 1", "description": "what it does" }
    ]
  }
}
\`\`\`
`,

    "monorail://ir-format": `# IR Format Reference

The IR (Intermediate Representation) is a JSON format for defining decks.

## Push Format (input to monorail_push)

\`\`\`json
{
  "deck": { "title": "Deck Title" },
  "slides": [
    {
      "id": "unique-id",
      "archetype": "title|section|big-idea|bullets|two-column|quote|chart|timeline|comparison|summary",
      "status": "draft|locked|stub",
      "content": {
        // archetype-specific fields
      },
      "speaker_notes": "Optional notes"
    }
  ]
}
\`\`\`

## Pull Format (output from monorail_pull)

When you pull from Figma, you get richer data:

\`\`\`json
{
  "slides": [
    {
      "id": "slide-1",
      "figma_id": "9:666",      // Use this for delete, reorder, patch
      "archetype": "title",
      "status": "draft",
      "content": { "headline": "...", "subline": "..." },
      "elements": [            // All text nodes with IDs
        {
          "id": "9:669",       // Node ID for patching
          "type": "headline",
          "text": "The headline text",
          "x": 200, "y": 420,
          "fontSize": 96,
          "isBold": true
        }
      ],
      "has_diagram": false     // True if complex nested content
    }
  ]
}
\`\`\`

## Status Values

- **draft**: Work in progress, can be modified
- **locked**: Finalized, won't be overwritten  
- **stub**: Placeholder, needs content

## Key IDs

- **slide.id**: Your ID (preserved across push/pull)
- **slide.figma_id**: Figma's ID (use for delete, reorder)
- **element.id**: Text node ID (use for patch)

## Example Push

\`\`\`json
{
  "slides": [
    {
      "id": "intro",
      "archetype": "title",
      "status": "draft",
      "content": {
        "headline": "Project Alpha",
        "subline": "Transforming how we work"
      }
    }
  ]
}
\`\`\`

## Verify Your Work

After pushing slides, use \`monorail_screenshot\` to see what was rendered:
- Verify layouts look correct
- Check text fits and doesn't overflow
- Spot alignment issues before the user does
`,
  };

  const content = resourceContent[uri];
  if (!content) {
    throw new Error(`Unknown resource: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: content,
      },
    ],
  };
});

// =============================================================================
// WEBSOCKET BRIDGE
// =============================================================================

const WS_PORT = 9876;
let wsServer: WebSocketServer | null = null;
let connectedPlugin: WebSocket | null = null;
let pluginInfo: { name?: string; version?: string; connectedAt?: string } = {};

// =============================================================================
// PENDING REQUEST MANAGER
// =============================================================================
// Consolidated request/response handling for WebSocket communication.
// Each request type gets a pending entry that tracks resolve/reject/timeout.

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// Result types for each request (some imported from shared/types.ts)
// These are local types not in shared:
interface CapturedTemplate { template: any; nodeCount: number; }
interface InstantiateResult { success: boolean; newSlideId?: string; updated?: number; failed?: string[]; fontSubstitutions?: string[]; error?: string; }
interface CreateResult { success: boolean; slideId?: string; error?: string; }

// Type-safe request type keys
type RequestType = 'pull' | 'patch' | 'capture' | 'instantiate' | 'create' | 'delete' | 'reorder' | 'screenshot' | 'primitives';

// Map of pending requests by type
const pendingRequests = new Map<RequestType, PendingRequest<any>>();

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Create a pending request with automatic timeout.
 * Returns a promise that resolves when the corresponding response arrives.
 */
function createPendingRequest<T>(type: RequestType, timeoutMessage: string): Promise<T> {
  // Reject if there's already a pending request of this type
  if (pendingRequests.has(type)) {
    return Promise.reject(new Error(`Another ${type} request is already in progress. Please wait.`));
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(type);
      reject(new Error(timeoutMessage));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(type, { resolve, reject, timeoutId });
  });
}

/**
 * Resolve a pending request with the result.
 */
function resolvePendingRequest<T>(type: RequestType, result: T): boolean {
  const pending = pendingRequests.get(type);
  if (!pending) return false;
  
  clearTimeout(pending.timeoutId);
  pendingRequests.delete(type);
  pending.resolve(result);
  return true;
}

/**
 * Check if a request type has a pending request.
 */
function hasPendingRequest(type: RequestType): boolean {
  return pendingRequests.has(type);
}

function startWebSocketServer() {
  wsServer = new WebSocketServer({ port: WS_PORT });

  wsServer.on("listening", () => {
    console.error(`[WebSocket] Server listening on ws://localhost:${WS_PORT}`);
  });

  wsServer.on("connection", (ws) => {
    console.error("[WebSocket] Plugin connected!");
    connectedPlugin = ws;

    ws.on("message", (data) => {
      const message = data.toString();
      console.error(`[WebSocket] Received: ${message}`);

      // Parse and handle messages
      try {
        const parsed = JSON.parse(message);

        if (parsed.type === "hello") {
          // Store plugin info
          pluginInfo = {
            name: parsed.plugin || "unknown",
            version: parsed.version || "unknown",
            connectedAt: new Date().toISOString(),
          };
          
          // Respond to hello with acknowledgment
          ws.send(
            JSON.stringify({
              type: "hello-ack",
              server: "monorail-mcp",
              version: "0.1.0",
              timestamp: new Date().toISOString(),
            })
          );
          console.error(`[WebSocket] Sent hello-ack to ${pluginInfo.name} v${pluginInfo.version}`);
        } else if (parsed.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else if (parsed.type === "exported") {
          // Plugin sent exported IR (response to request-export)
          console.error(`[WebSocket] Received exported IR with ${parsed.ir?.slides?.length || 0} slides`);
          if (parsed.ir) {
            resolvePendingRequest<DeckIR>('pull', parsed.ir as DeckIR);
          }
        } else if (parsed.type === "applied") {
          // Plugin confirmed it applied IR
          console.error(`[WebSocket] Plugin applied ${parsed.count} slides`);
        } else if (parsed.type === "patched") {
          // Plugin sent patch result
          const edited = parsed.updated || 0;
          const added = parsed.added || 0;
          const deleted = parsed.deleted || 0;
          console.error(`[WebSocket] Patched: ${edited} edited, ${added} added, ${deleted} deleted, ${parsed.failed?.length || 0} failed`);
          resolvePendingRequest<PatchResult>('patch', {
            updated: edited,
            added: added,
            deleted: deleted,
            failed: parsed.failed || [],
            newElements: parsed.newElements || [],
            deletedElements: parsed.deletedElements || [],
          });
        } else if (parsed.type === "template-captured") {
          // Plugin sent captured template
          console.error(`[WebSocket] Captured template with ${parsed.nodeCount} nodes`);
          resolvePendingRequest<CapturedTemplate>('capture', {
            template: parsed.template,
            nodeCount: parsed.nodeCount || 0,
          });
        } else if (parsed.type === "instantiated") {
          // Plugin sent instantiate result
          console.error(`[WebSocket] Instantiate result: success=${parsed.success}, updated=${parsed.updated}`);
          resolvePendingRequest<InstantiateResult>('instantiate', {
            success: parsed.success,
            newSlideId: parsed.newSlideId,
            updated: parsed.updated,
            failed: parsed.failed,
            fontSubstitutions: parsed.fontSubstitutions,
            error: parsed.error,
          });
        } else if (parsed.type === "styled-slide-created") {
          // Plugin sent create styled slide result
          console.error(`[WebSocket] Create styled slide result: success=${parsed.success}`);
          resolvePendingRequest<CreateResult>('create', {
            success: parsed.success,
            slideId: parsed.slideId,
            error: parsed.error,
          });
        } else if (parsed.type === "slides-deleted") {
          // Plugin sent delete result
          console.error(`[WebSocket] Delete result: deleted=${parsed.deleted}, failed=${parsed.failed?.length || 0}`);
          resolvePendingRequest<DeleteResult>('delete', {
            deleted: parsed.deleted || 0,
            failed: parsed.failed || [],
          });
        } else if (parsed.type === "slides-reordered") {
          // Plugin sent reorder result
          console.error(`[WebSocket] Reorder result: success=${parsed.success}, count=${parsed.count}`);
          resolvePendingRequest<ReorderResult>('reorder', {
            success: parsed.success,
            count: parsed.count,
            error: parsed.error,
          });
        } else if (parsed.type === "screenshot-exported") {
          // Plugin sent screenshot result
          const sizeKB = parsed.base64 ? Math.round((parsed.base64.length * 3 / 4) / 1024) : 0;
          console.error(`[WebSocket] Screenshot result: success=${parsed.success}, size=${sizeKB}KB`);
          resolvePendingRequest<ScreenshotResult>('screenshot', {
            success: parsed.success,
            slideId: parsed.slideId,
            slideName: parsed.slideName,
            base64: parsed.base64,
            width: parsed.width,
            height: parsed.height,
            error: parsed.error,
          });
        } else if (parsed.type === "primitives-applied") {
          // Plugin sent primitives result
          const count = parsed.created?.length || 0;
          console.error(`[WebSocket] Primitives result: success=${parsed.success}, created=${count}`);
          resolvePendingRequest<{
            success: boolean;
            slideId?: string;
            slideName?: string;
            created?: Array<{ name: string; id: string; type: string }>;
            error?: string;
          }>('primitives', {
            success: parsed.success,
            slideId: parsed.slideId,
            slideName: parsed.slideName,
            created: parsed.created,
            error: parsed.error,
          });
        } else {
          // Echo unknown messages for now (debugging)
          console.error(`[WebSocket] Unknown message type: ${parsed.type}`);
        }
      } catch (e) {
        // Not JSON, echo as text
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      }
    });

    ws.on("close", () => {
      console.error("[WebSocket] Plugin disconnected");
      if (connectedPlugin === ws) {
        connectedPlugin = null;
        pluginInfo = {};
      }
    });

    ws.on("error", (err) => {
      console.error("[WebSocket] Error:", err.message);
    });
  });

  wsServer.on("error", (err) => {
    console.error("[WebSocket] Server error:", err.message);
  });
}

// Start the server
async function main() {
  // Start WebSocket server for plugin communication
  startWebSocketServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Monorail MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
