#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolRequest,
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
          "Check the connection to the Figma plugin. Reports whether a plugin is connected (and which build, and whether it is paired), the shared proxy this session goes through, who holds the plugin right now (request type, session, age), what is queued behind it, and recent requests the plugin never answered, plus the current selection. When the plugin isn't paired it prints the pairing code: give that code to the user to paste into the Monorail plugin window themselves; never pair on the user's behalf.",
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
        name: "monorail_css",
        description:
          "Extract CSS and raw paint data from a Figma node. Returns Figma's getCSSAsync() output (same as 'Copy as CSS') plus raw fills, strokes, effects with full gradient data and blend modes. Use for design-to-code translation.",
        inputSchema: {
          type: "object" as const,
          properties: {
            node_id: {
              type: "string",
              description:
                "Figma node ID to extract CSS from. If omitted, uses the currently selected node.",
            },
            timeout_ms: {
              type: "number",
              description: "The most this call may take, in ms (default 90000; 1000–600000): waiting its turn behind other sessions' requests plus the plugin's own work. A big node can take longer. The call returns by about timeout_ms + 2s (+ up to 3s if the proxy link is reconnecting), with an error naming the limit that ran out. While it runs, other sessions' requests queue behind it.",
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
            min_font_size: {
              type: "number",
              description:
                "Warning threshold for text size, default 24 (presentation body copy). Diagram labels legitimately sit at 12-20px; set this to stop dozens of expected warnings from burying real ones.",
            },
            step_seconds: {
              type: "number",
              description: "Seconds between build steps for ops that carry 'reveal' (default 1.5). Step N lands at N × step_seconds on the slide's timeline.",
            },
            build_mode: {
              type: "string",
              enum: ["auto", "motion", "slides", "groups"],
              description: "How reveals are realised. 'auto' (default): Motion object animations where the editor exposes them (Design); in Figma Slides (no object-animation API) one slide with a transparent frame per build step named 'Reveal N', so the presenter adds one Fade in / On click object animation per frame in the Animate panel. 'groups' forces that. 'slides' instead clones one slide per build state with a native SMART_ANIMATE transition (no manual step, but N slides per scene). 'motion' forces Motion and warns if unavailable.",
            },
            transition: {
              type: "string",
              enum: ["SMART_ANIMATE", "DISSOLVE", "NONE"],
              description: "Slide transition between step slides (default SMART_ANIMATE — persisting layers hold still, arriving ones fade in). Only used when reveals become step slides.",
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
                  width: { type: "number", description: "Width (rect, ellipse, frame). On auto_layout_frame it fixes that axis instead of hugging." },
                  height: { type: "number", description: "Height (rect, ellipse, frame). On auto_layout_frame it fixes that axis instead of hugging." },
                  length: { type: "number", description: "Length (for line, arrow)" },
                  rotation: { type: "number", description: "Rotation in degrees (line, text). Positive reads clockwise on screen, matching the arrow op. NOTE: before 2026-07-30 a plain line rotated counter-clockwise here while a capped one rotated clockwise; both are clockwise now." },
                  // Arrow properties
                  direction: { type: ["string", "number"], description: "Direction for arrow AND line: 'right', 'left', 'up', 'down', or a number of degrees. Also used for Auto Layout: 'VERTICAL', 'HORIZONTAL'. An unrecognised value warns rather than silently meaning 'right'." },
                  headSize: { type: "number", description: "Arrowhead size in pixels (default: 12)" },
                  bidirectional: { type: "boolean", description: "If true, arrow has heads on both ends" },
                  // Text properties
                  text: { type: "string", description: "Text content (for text op)" },
                  fontSize: { type: "number", description: "Font size in pixels (for text op). Below the batch minimum (24px by default) triggers a warning — see the top-level min_font_size for diagram work." },
                  bold: { type: "boolean", description: "Bold font (for text op)" },
                  fontFamily: { type: "string", description: "Font family for this text node, e.g. 'PP Supply Sans' or 'Geist'. Omit to use the plugin's fallback chain (Supply → Inter → SF Pro Display → Helvetica Neue → Arial). Set this when matching an existing deck's typography — the chain will NOT find 'PP Supply Sans' on its own and silently lands on Inter. An unavailable family falls back to the chain rather than failing." },
                  maxWidth: { type: "number", description: "Maximum width before wrapping (for text op)" },
                  alignment: { type: "string", enum: ["LEFT", "CENTER", "RIGHT"], description: "Horizontal text alignment (text op). With width+height set, the text box is fixed and the text aligns inside it — use for centred labels." },
                  weight: { type: ["number", "string"], description: "Font weight for the text op: 400/500/600/700 (650 rounds to 600) or a name such as 'medium' / 'semibold'. Loads the family's matching style (Medium, SemiBold…) and degrades to a neighbour, then Bold/Regular, with a warning. Overrides 'bold'." },
                  lineHeight: { type: ["number", "string"], description: "Line height for the text op. A number ≤ 3 is a CSS multiplier (1.04 → 104%), a larger number is pixels, or '120%' / '40px'. Omit for Figma's auto line height, which is looser than most CSS." },
                  letterSpacing: { type: ["number", "string"], description: "Letter spacing for the text op: a number is pixels (already scaled), or '-0.035em' / '11%' as a percentage of the font size." },
                  visible: { type: "boolean", description: "false hides the layer after creation (any named op). Use for speaker notes or reference text that should live on the slide without rendering." },
                  verticalAlignment: { type: "string", enum: ["TOP", "CENTER", "BOTTOM"], description: "Vertical text alignment inside a fixed width+height text box (text op)." },
                  // Colors (named: 'headline', 'body', 'muted', 'cyan', 'orange', 'green', 'pink', 'red', 'yellow', hex '#1a1a2e', or {r,g,b})
                  color: { type: "string", description: "Color for text, line, or arrow" },
                  fill: { type: "string", description: "Fill color for solid backgrounds and shapes. Omitting fill while setting stroke gives an OUTLINE (transparent interior) rather than a white box." },
                  stroke: { type: "string", description: "Stroke color for shapes" },
                  // Gradient (for background op only)
                  gradient: {
                    type: "object",
                    description: "Gradient fill for background, rect, ellipse, frame, or a closed path. Use instead of 'fill'.",
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
                  strokeWeight: { type: "number", description: "Stroke width. Applies to line, path, rect, ellipse and frame (default 2)." },
                  dash: {
                    type: ["number", "array"],
                    items: { type: "number" },
                    description: "Dashed stroke. A number gives an even pattern (6 → 6 on, 6 off); an array is explicit ([8, 4]). Works on rect, ellipse, frame, auto_layout_frame, line and path.",
                  },
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
                    description: "Array of {x, y} points for path op. Minimum 2 points. Points may be given in slide coordinates — the path is placed where the points say. Any x/y on the op is added as an extra offset, so relative points still work.",
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
                  cornerRadius: { type: "number", description: "Corner radius (rect, frame)" },
                  clipsContent: { type: "boolean", description: "For frame: clip children to bounds (default false, so connectors may overhang)" },
                  // Auto Layout properties
                  spacing: { type: "number", description: "Item spacing in Auto Layout (default: 24)" },
                  stretch: { type: "boolean", description: "For a child of an auto_layout_frame: fill the container's cross axis, so rows share one width instead of hugging their own text. Honoured on frame, auto_layout_frame, text, rect, ellipse, line, path and arrow." },
                  grow: { type: "boolean", description: "For a child of an auto_layout_frame: fill the leftover space along the main axis. Boolean fill, not a flex-grow weight — there are no proportions." },
                  padding: { type: "number", description: "Uniform padding in Auto Layout" },
                  // Native object animation
                  reveal: {
                    type: ["number", "object"],
                    description: "Reveal this element as a build step using Figma's native object animations (one slide, no duplicates). A number is the step: 1 = first advance, 2 = second… 0 animates in as the slide opens. Object form: {step, offset, duration, style, props} — 'style' is an animation style name such as 'fade in' or 'slide in' (see monorail_motion list); 'offset' in seconds overrides step. Requires 'name' on the op. Steps map to timeline offsets of step × step_seconds; with no style match the element fades in via an opacity keyframe.",
                    properties: {
                      step: { type: "number", description: "Build step (non-negative integer). Default 1." },
                      offset: { type: "number", description: "Timeline offset in seconds; overrides step." },
                      duration: { type: "number", description: "Animation length in seconds (default 0.4)." },
                      style: { type: "string", description: "Animation style id or (partial) name, e.g. 'fade in'." },
                      props: { type: "object", description: "Style-specific props, e.g. {direction:'right', distance:120}." },
                      until: { type: "number", description: "Last build step this element is visible at (step-slide builds). {step:1, until:1} shows it only on step 1." },
                    },
                  },
                },
                required: ["op"],
              },
            },
          },
          required: ["operations"],
        },
      },
      {
        name: "monorail_motion",
        description:
          "Reveals and builds with Figma's native animation. Actions: 'apply' reveals to existing nodes ([{target, step|offset, duration, style, props}]) — in the Design editor this applies Motion object animations on one slide; in Figma Slides (where the Plugin API exposes no object animations) it builds one slide per step with a Smart Animate transition, cloning the slide so persisting layers hold still and arriving ones fade in. 'list' the Motion animation styles (Design only); 'inspect' animations and slide transitions on slides/nodes; 'clear' Motion animations from nodes. Prefer the 'reveal' field on monorail_primitives ops when building from scratch; use this tool for slides that already exist.",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: {
              type: "string",
              enum: ["list", "apply", "inspect", "clear"],
              description: "What to do.",
            },
            targets: {
              type: "array",
              items: { type: "string" },
              description: "For inspect/clear: slide IDs (their children are used) or node IDs.",
            },
            reveals: {
              type: "array",
              description: "For apply: one entry per node to animate.",
              items: {
                type: "object",
                properties: {
                  target: { type: "string", description: "Figma node ID (from monorail_pull or monorail_primitives output)." },
                  step: { type: "number", description: "Build step (non-negative integer). Default 1." },
                  offset: { type: "number", description: "Timeline offset in seconds; overrides step." },
                  duration: { type: "number", description: "Animation length in seconds (default 0.4)." },
                  style: { type: "string", description: "Animation style id or (partial) name, e.g. 'fade in'. Omit for the document's fade/appear style." },
                  props: { type: "object", description: "Style-specific props passed through, e.g. {direction:'right'}." },
                  until: { type: "number", description: "Last build step this element is visible at (step-slide builds only)." },
                },
                required: ["target"],
              },
            },
            step_seconds: {
              type: "number",
              description: "Seconds between build steps (default 1.5).",
            },
            build_mode: {
              type: "string",
              enum: ["auto", "motion", "slides", "groups"],
              description: "How reveals are realised. 'auto' (default): Motion object animations where the editor exposes them (Design); in Figma Slides (no object-animation API) one slide with a transparent frame per build step named 'Reveal N', so the presenter adds one Fade in / On click object animation per frame in the Animate panel. 'groups' forces that. 'slides' instead clones one slide per build state with a native SMART_ANIMATE transition (no manual step, but N slides per scene). 'motion' forces Motion and warns if unavailable.",
            },
            transition: {
              type: "string",
              enum: ["SMART_ANIMATE", "DISSOLVE", "NONE"],
              description: "Slide transition between step slides (default SMART_ANIMATE — persisting layers hold still, arriving ones fade in). Only used when reveals become step slides.",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "monorail_probe",
        description:
          "Explore the live Figma Plugin API from inside the plugin sandbox — including undocumented surface. 'globals' lists every own property of `figma` and its namespaces plus non-standard globals; 'node' lists every property up a node's prototype chain with its current value (optional regex filter, e.g. 'anim|transition|reveal'); 'eval' runs an async JS function body with `figma`, `node` (nodeId or selection), `protoNames(obj)` and `safeJson(v, depth?)` in scope and returns what it returns. Results are capped (max_items, max_keys, max_depth); every cut is marked in the value and flagged at the top of the output. Development plugin only.",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: { type: "string", enum: ["globals", "node", "eval"], description: "What to do." },
            node_id: { type: "string", description: "For node/eval: Figma node ID. Defaults to the current selection." },
            filter: { type: "string", description: "For node: case-insensitive regex on property names." },
            code: { type: "string", description: "For eval: async function body. `return` a JSON-serialisable value." },
            max_items: { type: "number", description: "Items kept per list in the result (default 50, up to 10000). Cut lists end with a \"[… N more items]\" marker and the reply carries a truncation report." },
            max_keys: { type: "number", description: "Keys kept per object (default 80, up to 10000). A cut object gets a \"…\" key." },
            max_depth: { type: "number", description: "Levels serialised (default 4 for eval, 2 per property for node; up to 12). Deeper values show as [array n] / [object T]." },
            timeout_ms: { type: "number", description: "The most this call may take, in ms (default 120000; 1000–600000): waiting its turn behind other sessions' requests plus the probe itself. It returns by about timeout_ms + 2s (+ up to 3s if the proxy link is reconnecting). Other sessions' requests queue behind the probe while it runs; a synchronous eval can't be interrupted, so keep heavy walks bounded." },
          },
          required: ["action"],
        },
      },
      {
        name: "monorail_export",
        description:
          "Export any Figma node as SVG or PNG. Unlike monorail_screenshot (slide-level PNG), this targets individual nodes (vectors, components, icons) and supports SVG output. Returns SVG as a UTF-8 string or PNG as base64.",
        inputSchema: {
          type: "object" as const,
          properties: {
            node_id: {
              type: "string",
              description:
                "Figma node ID to export. If omitted, exports the currently selected node.",
            },
            format: {
              type: "string",
              enum: ["SVG", "PNG"],
              description: "Export format (default: SVG).",
            },
            scale: {
              type: "number",
              description:
                "Export scale factor (default: 1). Only affects PNG output.",
            },
            timeout_ms: {
              type: "number",
              description: "The most this call may take, in ms (default 90000; 1000–600000): waiting its turn behind other sessions' requests plus the plugin's own work. A big node can take longer. The call returns by about timeout_ms + 2s (+ up to 3s if the proxy link is reconnecting), with an error naming the limit that ran out. While it runs, other sessions' requests queue behind it.",
            },
          },
        },
      },
      {
        name: "monorail_component",
        description:
          "Get component info for a Figma node. Returns main component, variant properties, component set, and sibling variants. Works on instances (returns source component), components, and component sets.",
        inputSchema: {
          type: "object" as const,
          properties: {
            node_id: {
              type: "string",
              description:
                "Figma node ID. Can be an instance, component, or component set. If omitted, uses selected node.",
            },
          },
        },
      },
      {
        name: "monorail_find",
        description:
          "Search for nodes by type and/or name. Returns IDs, positions, bounds, and parent info. Use to discover components, vectors, text nodes, or frames in the document. Searches current page by default, or within a specific parent node.",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              description:
                "Node type filter (e.g. 'COMPONENT', 'INSTANCE', 'VECTOR', 'TEXT', 'FRAME'). Optional.",
            },
            name: {
              type: "string",
              description: "Name filter — substring match, case-insensitive. Optional.",
            },
            parent_id: {
              type: "string",
              description:
                "Scope search to descendants of this node ID. If omitted, searches entire current page.",
            },
            limit: {
              type: "number",
              description: "Maximum results to return (default: 20, max: 100).",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls. Each runs with its call's abort signal in callContext,
// so a cancelled call withdraws whatever it is waiting on from the plugin.
server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
  callContext.run({ signal: extra?.signal }, () => handleToolCall(request)));

async function handleToolCall(request: CallToolRequest) {
  const { name, arguments: args } = request.params;

  switch (name) {
    // =========================================================================
    // monorail_status - Check plugin connection
    // =========================================================================
    case "monorail_status": {
      await linkReady();
      return { content: [{ type: "text" as const, text: await statusText() }] };
    }

    // =========================================================================
    // monorail_pull - Get deck state from Figma
    // =========================================================================
    case "monorail_pull": {
      const isConnected = await linkReady();

      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
            },
          ],
          isError: true,
        };
      }

      // Parse optional params
      const slideIdFilter = args?.slide_id as string | undefined;
      const mode = (args?.mode as string) || "full";

      // Create pending request and send to plugin
      const pullPromise = pluginRequest<DeckIR>({ type: "request-export" });

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
      const isConnected = await linkReady();
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
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

      // Send to plugin. With autoApply the plugin answers `applied`, so wait for
      // it: a push that was refused (plugin busy, no plugin) used to report
      // success anyway. Without autoApply the plugin only shows a toast and
      // never replies, so there is nothing to wait for.
      const pushMessage = {
        type: "push-ir",
        ir: ir,
        autoApply: autoApply,
        mode: mode,
        startIndex: mode === "append" ? startIndex : undefined, // startIndex only applies in append mode
      };
      try {
        if (autoApply) {
          await pluginRequest(pushMessage);
        } else {
          connectedPlugin!.send(JSON.stringify(pushMessage));
        }
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error pushing slides: ${e instanceof Error ? e.message : "unknown error"}` }],
          isError: true,
        };
      }

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
      const isConnected = await linkReady();
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
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

      // Create pending request and send to plugin
      const patchPromise = pluginRequest<PatchResult>({ type: "patch-elements", patches });

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
      const isConnected = await linkReady();

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
              text: notConnectedMessage(),
            },
          ],
          isError: true,
        };
      }

      // Create pending request and send to plugin (with optional slideId and maxDepth)
      const capturePromise = pluginRequest<CapturedTemplate>({ type: "capture-template", slideId, maxDepth });

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
    // monorail_css - Extract CSS + raw paint data from a node
    // =========================================================================
    case "monorail_css": {
      const isConnected = await linkReady();

      const nodeId = typeof request.params?.arguments?.node_id === 'string'
        ? request.params.arguments.node_id
        : undefined;

      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
            },
          ],
          isError: true,
        };
      }

      const cssPromise = pluginRequest<CssResult>({ type: "get-css", nodeId }, { timeoutMs: request.params?.arguments?.timeout_ms });

      try {
        const result = await cssPromise;

        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error extracting CSS: ${result.error}`,
              },
            ],
            isError: true,
          };
        }

        // Format CSS properties as a CSS block
        const cssLines = Object.entries(result.css || {})
          .map(([prop, val]) => `${prop}: ${val};`)
          .join('\n');

        const output = {
          node: result.raw?.name,
          type: result.raw?.type,
          dimensions: { width: result.raw?.width, height: result.raw?.height },
          css: result.css,
          raw: result.raw,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ CSS for "${result.raw?.name}" (${result.raw?.type}, ${result.raw?.width}×${result.raw?.height})

**Figma CSS:**
\`\`\`css
${cssLines}
\`\`\`

**Raw paint data:**
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
              text: `Error extracting CSS: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_export - Export node as SVG or PNG
    // =========================================================================
    case "monorail_export": {
      const isConnected = await linkReady();

      const nodeId = typeof request.params?.arguments?.node_id === 'string'
        ? request.params.arguments.node_id
        : undefined;
      const format = typeof request.params?.arguments?.format === 'string'
        ? request.params.arguments.format.toUpperCase()
        : 'SVG';
      const scale = typeof request.params?.arguments?.scale === 'number'
        ? request.params.arguments.scale
        : 1;

      if (!isConnected) {
        return {
          content: [{ type: "text" as const, text: notConnectedMessage() }],
          isError: true,
        };
      }

      const exportPromise = pluginRequest<ExportResult>({ type: "export-node", nodeId, format, scale }, { timeoutMs: request.params?.arguments?.timeout_ms });

      try {
        const result = await exportPromise;

        if (!result.success) {
          return {
            content: [{ type: "text" as const, text: `Error exporting node: ${result.error}` }],
            isError: true,
          };
        }

        if (result.format === 'PNG') {
          return {
            content: [
              {
                type: "text" as const,
                text: `✓ Exported "${result.nodeName}" as PNG (${result.width}×${result.height})`,
              },
              {
                type: "image" as const,
                data: result.data!,
                mimeType: "image/png",
              },
            ],
          };
        } else {
          // SVG — return as text
          return {
            content: [
              {
                type: "text" as const,
                text: `✓ Exported "${result.nodeName}" as SVG (${result.width}×${result.height})\n\n\`\`\`svg\n${result.data}\n\`\`\``,
              },
            ],
          };
        }
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error exporting node: ${e instanceof Error ? e.message : "unknown error"}` }],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_component - Inspect component relationships
    // =========================================================================
    case "monorail_component": {
      const isConnected = await linkReady();

      const nodeId = typeof request.params?.arguments?.node_id === 'string'
        ? request.params.arguments.node_id
        : undefined;

      if (!isConnected) {
        return {
          content: [{ type: "text" as const, text: notConnectedMessage() }],
          isError: true,
        };
      }

      const compPromise = pluginRequest<ComponentInfoResult>({ type: "get-component-info", nodeId });

      try {
        const result = await compPromise;

        if (!result.success) {
          return {
            content: [{ type: "text" as const, text: `Error getting component info: ${result.error}` }],
            isError: true,
          };
        }

        // Build human-readable summary
        const lines: string[] = [];
        lines.push(`✓ Component info for "${result.node.name}" (${result.node.type})`);
        if (result.isInstance && result.mainComponent) {
          lines.push(`  Instance of: "${result.mainComponent.name}" (${result.mainComponent.id})`);
          if (result.mainComponent.description) lines.push(`  Description: ${result.mainComponent.description}`);
        }
        if (result.componentSet) {
          lines.push(`  Component set: "${result.componentSet.name}" (${result.componentSet.variantCount} variants)`);
        }
        if (result.componentProperties && Object.keys(result.componentProperties).length > 0) {
          lines.push(`  Properties:`);
          for (const [key, prop] of Object.entries(result.componentProperties)) {
            lines.push(`    ${key}: ${prop.value} (${prop.type})`);
          }
        }
        if (result.variants && result.variants.length > 0) {
          lines.push(`  Variants:`);
          for (const v of result.variants) {
            lines.push(`    - "${v.name}" (${v.id})`);
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join('\n') + `\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error getting component info: ${e instanceof Error ? e.message : "unknown error"}` }],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_find - Search nodes by type/name
    // =========================================================================
    case "monorail_find": {
      const isConnected = await linkReady();

      const nodeType = typeof request.params?.arguments?.type === 'string'
        ? request.params.arguments.type
        : undefined;
      const nodeName = typeof request.params?.arguments?.name === 'string'
        ? request.params.arguments.name
        : undefined;
      const parentId = typeof request.params?.arguments?.parent_id === 'string'
        ? request.params.arguments.parent_id
        : undefined;
      const limit = typeof request.params?.arguments?.limit === 'number'
        ? Math.min(Math.max(request.params.arguments.limit, 1), 100)
        : 20;

      if (!isConnected) {
        return {
          content: [{ type: "text" as const, text: notConnectedMessage() }],
          isError: true,
        };
      }

      const findPromise = pluginRequest<FindResult>({ type: "find-nodes", nodeType, name: nodeName, parentId, limit });

      try {
        const result = await findPromise;

        if (!result.success) {
          return {
            content: [{ type: "text" as const, text: `Error searching nodes: ${result.error}` }],
            isError: true,
          };
        }

        const nodes = result.nodes || [];
        if (nodes.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No nodes found matching criteria.` }],
          };
        }

        const lines: string[] = [];
        lines.push(`✓ Found ${result.total} node(s)${result.truncated ? ` (showing ${nodes.length})` : ''}`);
        lines.push('');
        for (const n of nodes) {
          lines.push(`- **${n.name}** (${n.type}) — ID: \`${n.id}\`, ${n.width}×${n.height} at (${n.x}, ${n.y})${n.parentName ? ` in "${n.parentName}"` : ''}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join('\n') + `\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error searching nodes: ${e instanceof Error ? e.message : "unknown error"}` }],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_clone - Clone slide and update content
    // =========================================================================
    case "monorail_clone": {
      const isConnected = await linkReady();
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
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

      // Create pending request and send to plugin
      const instantiatePromise = pluginRequest<InstantiateResult>({
        type: "instantiate-template",
        sourceId: sourceSlideId,
        contentMap: contentMap || {}
      });

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
      const isConnected = await linkReady();
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
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

      // Create pending request and send to plugin
      const deletePromise = pluginRequest<DeleteResult>({ type: "delete-slides", slideIds });

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
      const isConnected = await linkReady();
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
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

      // Create pending request and send to plugin
      const reorderPromise = pluginRequest<ReorderResult>({ type: "reorder-slides", slideIds });

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
      const isConnected = await linkReady();
      
      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
            },
          ],
          isError: true,
        };
      }

      const slideId = args?.slide_id as string | undefined;
      const scale = (args?.scale as number) || 0.5;

      // Create pending request and send to plugin
      const screenshotPromise = pluginRequest<ScreenshotResult>({ type: "request-screenshot", slideId, scale });

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
      const isConnected = await linkReady();

      if (!isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: notConnectedMessage(),
            },
          ],
          isError: true,
        };
      }

      const slideId = args?.slide_id as string | undefined;
      const operations = args?.operations as any[];
      const minFontSize = args?.min_font_size as number | undefined;

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

      try {
        // Create promise for response
        const resultPromise = pluginRequest<{
          success: boolean;
          slideId?: string;
          slideName?: string;
          created?: Array<{ name: string; id: string; type: string }>;
          animated?: RevealResult[];
          stepSlides?: StepSlideResult[];
          groups?: RevealGroupResult[];
          warnings?: string[];
          error?: string;
        }>({
          type: 'apply-primitives',
          slideId,
          operations,
          minFontSize,
          stepSeconds: args?.step_seconds as number | undefined,
          buildMode: args?.build_mode,
          transition: args?.transition,
        });

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
        const revealsText = formatReveals(result.animated) + formatStepSlides(result.stepSlides) + formatGroups(result.groups);
        
        // Format warnings if any
        let warningsText = '';
        if (result.warnings && result.warnings.length > 0) {
          warningsText = `\n\n**⚠️ Design Warnings (${result.warnings.length}):**\n${result.warnings.map(w => `  - ${w}`).join('\n')}\n\n_Minimum font size is ${minFontSize ?? 24}px for readability at presentation distance. Diagram work can lower it with min_font_size._`;
        }
        
        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Created ${result.created?.length || 0} elements on "${result.slideName}" (${result.slideId})

**Created nodes:**
${createdList}${revealsText}${warningsText}

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

    // =========================================================================
    // monorail_motion - Native object animations (reveals) on one slide
    // =========================================================================
    case "monorail_motion": {
      const isConnected = await linkReady();
      if (!isConnected) {
        return {
          content: [{ type: "text" as const, text: notConnectedMessage() }],
          isError: true,
        };
      }
      const action = args?.action as string;
      if (!["list", "apply", "inspect", "clear"].includes(action)) {
        return { content: [{ type: "text" as const, text: `Error: unknown action "${action}". Use list, apply, inspect or clear.` }], isError: true };
      }
      try {
        const resultPromise = pluginRequest<MotionResult>({
          type: 'apply-motion',
          action,
          targets: args?.targets,
          reveals: args?.reveals,
          stepSeconds: args?.step_seconds,
          buildMode: args?.build_mode,
          transition: args?.transition,
        });
        const result = await resultPromise;
        if (!result.success) {
          return { content: [{ type: "text" as const, text: `Error: ${result.error || "Unknown error"}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: formatMotionResult(action, result) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error in monorail_motion: ${e instanceof Error ? e.message : "unknown error"}` }],
          isError: true,
        };
      }
    }

    // =========================================================================
    // monorail_probe - explore the Plugin API from inside the sandbox
    // =========================================================================
    case "monorail_probe": {
      const isConnected = await linkReady();
      if (!isConnected) {
        return { content: [{ type: "text" as const, text: notConnectedMessage() }], isError: true };
      }
      try {
        const resultPromise = pluginRequest<Record<string, unknown> & { success: boolean; error?: string }>({
          type: 'apply-probe', action: args?.action, nodeId: args?.node_id, filter: args?.filter, code: args?.code,
          maxItems: args?.max_items, maxKeys: args?.max_keys, maxDepth: args?.max_depth,
        }, { timeoutMs: args?.timeout_ms });
        const result = await resultPromise;
        if (!result.success) return { content: [{ type: "text" as const, text: `Error: ${result.error}` }], isError: true };
        const { success, type, requestId, ...rest } = result as any;
        // Say so up front when a limit cut the result: the old caps cut lists at
        // 50 items with no sign, and dumps were read as complete.
        const warning = describeTruncation(result);
        const body = JSON.stringify(rest, null, 2);
        return { content: [{ type: "text" as const, text: warning ? `${warning}\n\n${body}` : body }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error in monorail_probe: ${e instanceof Error ? e.message : "unknown error"}` }], isError: true };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Motion result types + formatting ─────────────────────────────────────────
interface RevealResult {
  id: string; name: string; mode: 'style' | 'keyframe' | 'unavailable';
  style?: string; step?: number; offset: number; duration: number;
}
interface StepSlideResult { id: string; name: string; step: number; transition: string }
interface RevealGroupResult { id: string; name: string; step: number; until?: number; members: string[] }
interface MotionResult {
  success: boolean; action?: string; error?: string; mode?: 'motion' | 'slides' | 'groups' | 'none';
  styles?: Array<{ styleId: string; name: string; description?: string; props?: Record<string, unknown> }>;
  applied?: RevealResult[]; stepSlides?: StepSlideResult[]; groups?: RevealGroupResult[]; warnings?: string[];
  nodes?: Array<Record<string, unknown>> | number; motionAvailable?: boolean; removed?: number;
  slides?: Array<{ id: string; name: string; transition?: { style?: string; duration?: number; timing?: { type?: string } }; skipped?: boolean }>;
  apiVersion?: string; editorType?: string;
}

function formatGroups(groups?: RevealGroupResult[]): string {
  if (!groups || groups.length === 0) return '';
  const rows = groups.map(g => `  - "${g.name}" — ${g.id}: ${g.members.join(', ')}`);
  return `\n\n**Reveal groups (one slide):**\n${rows.join('\n')}\n\n_Figma Slides has no object-animation API, so finish in Figma: select each group in the Layers panel → Animate tab → Fade in, On click (an "exit after" group also gets an exit animation). One click per group._`;
}

function formatStepSlides(stepSlides?: StepSlideResult[]): string {
  if (!stepSlides || stepSlides.length === 0) return '';
  const rows = stepSlides.map(s => `  - step ${s.step}: "${s.name}" — ${s.id}${s.transition !== 'none' ? ` (enter: ${s.transition})` : ''}`);
  return `\n\n**Build slides (native ${stepSlides[stepSlides.length - 1].transition} transition):**\n${rows.join('\n')}\n\n_Figma Slides exposes no object animations to plugins, so each build step is its own slide; the last one is the settled state. Present with Right/click to advance._`;
}

function formatReveals(animated?: RevealResult[]): string {
  if (!animated || animated.length === 0) return '';
  const rows = animated.map(a => {
    const when = a.step !== undefined ? `step ${a.step} (${a.offset}s)` : `${a.offset}s`;
    const how = a.mode === 'style' ? a.style : a.mode === 'keyframe' ? 'opacity keyframe' : 'not applied';
    return `  - ${a.name}: ${when}, ${a.duration}s, ${how} — ${a.id}`;
  });
  return `\n\n**Reveals (native object animations):**\n${rows.join('\n')}\n\n_Steps are timeline offsets; open the slide's Object animations panel to confirm click grouping. Screenshot shows the settled end state._`;
}

function formatMotionResult(action: string, r: MotionResult): string {
  const warn = r.warnings && r.warnings.length ? `\n\n**⚠️ Warnings:**\n${r.warnings.map(w => `  - ${w}`).join('\n')}` : '';
  if (action === 'list') {
    if (!r.styles || r.styles.length === 0) return 'No animation styles reported by Figma for this document.';
    const rows = r.styles.map(s => `  - **${s.name}** \`${s.styleId}\`${s.description ? ` — ${s.description}` : ''}${s.props ? `\n    props: ${JSON.stringify(s.props)}` : ''}`);
    return `✓ ${r.styles.length} animation style(s):\n${rows.join('\n')}\n\nUse a name (e.g. "fade in") as \`style\` in reveals.`;
  }
  if (action === 'apply') {
    if (r.mode === 'slides') return `✓ Built ${r.stepSlides?.length || 0} step slide(s)${formatStepSlides(r.stepSlides)}${warn}`;
    if (r.mode === 'groups') return `✓ Grouped ${r.groups?.length || 0} reveal step(s) on one slide${formatGroups(r.groups)}${warn}`;
    return `✓ Applied ${r.applied?.length || 0} reveal(s)${formatReveals(r.applied)}${warn}`;
  }
  if (action === 'inspect') {
    const nodes = Array.isArray(r.nodes) ? r.nodes : [];
    const rows = nodes.map(n => {
      const styles = (n.animationStyles as Array<{ name: string; timelineOffset?: number; duration?: number }>) || [];
      const s = styles.length ? styles.map(x => `${x.name}@${x.timelineOffset ?? 0}s/${x.duration ?? '?'}s`).join(', ') : '';
      const manual = (n.manualTracks as string[]) || [];
      const tl = (n.timelines as Array<{ duration: number }>) || [];
      const bits = [s, manual.length ? `manual: ${manual.join(',')}` : '', tl.length ? `timeline ${tl[0].duration}s` : ''].filter(Boolean).join('; ');
      return `  - ${n.name} (${n.type}) ${n.id}: ${bits || 'no animation'}`;
    });
    const slideRows = (r.slides || []).map(s => `  - slide "${s.name}" ${s.id}: enter ${s.transition?.style ?? 'NONE'}${s.transition?.duration !== undefined ? ` ${s.transition.duration}s` : ''}${s.transition?.timing?.type ? ` on ${s.transition.timing.type}` : ''}${s.skipped ? ' (skipped)' : ''}`);
    const head = `✓ Animation on ${nodes.length} node(s) — Motion API ${r.motionAvailable ? 'available' : 'unavailable'} in the ${r.editorType ?? '?'} editor`;
    return `${head}${slideRows.length ? `\n${slideRows.join('\n')}` : ''}\n${rows.join('\n')}`;
  }
  return `✓ Cleared ${r.removed ?? 0} animation(s) across ${r.nodes ?? 0} node(s)${warn}`;
}

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

### Universal Layout Principles (Generalizable)

These apply to any slide, not just specific layouts:

- **Breathing room:** Distinct sections should not touch. Give space so the eye can reset.
- **Visual balance:** Distribute weight across the canvas; avoid top‑heavy or bottom‑empty layouts.
- **Hierarchy via proximity:** Related items cluster together; unrelated items get extra distance.
- **Closer stands alone:** The final punchline should be visually distinct (centered or isolated).
- **Bridge alignment:** If there is a bridge element (e.g. KEY CARD), align it to narrative pivot points.
- **Size moderation:** Larger type improves readability, but can crowd layout—balance size with spacing.

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
//
// Two ways to reach the Figma plugin:
// - proxy mode (normal): this server is one upstream client of the shared
//   proxy (src/proxy.ts) on PROXY_PORT; the plugin connects to the proxy on
//   WS_PORT. If the proxy goes away, this server reconnects with backoff and
//   starts a new proxy when none is listening.
// - direct mode (only with MONORAIL_DIRECT=1): this server listens on
//   WS_PORT itself, and only this session can use the plugin.
//
// Every request goes through pluginRequest(). It carries a requestId, a
// timeoutMs and a clientLabel (shared/protocol.ts), and its reply is matched
// by id: a late reply can't resolve a different call, and sibling sub-agents
// sharing this process don't block each other. A protocol 3 proxy queues the
// request until the plugin is free (`queued`), within its timeoutMs; an older
// proxy answers `busy`, which is retried until that same deadline. A tool call
// that is cancelled withdraws its request (`cancel`). The server registers
// with the token in ~/.monorail/token. See docs/proxy-wedge-2026-09.md.

import { spawn } from "child_process";
import { AsyncLocalStorage } from "async_hooks";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import os from "os";
import {
  PROTOCOL_VERSION, RESPONSE_FOR, RESPONSE_TYPES, DEFAULT_TIMEOUT_MS, WRITE_REQUEST_TYPES,
  MIN_TIMEOUT_MS, clampTimeout, type RequestErrorCode,
} from "../shared/protocol.js";
import {
  readOrCreateToken, pairingCodeFor, tokenPath, LOOPBACK_ADDRESSES, isLoopbackHost, downstreamOriginAllowed,
} from "./auth.js";
import { describeTruncation } from "../shared/probe.js";

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

const WS_PORT = envInt("MONORAIL_WS_PORT", 9876);
const PROXY_PORT = envInt("MONORAIL_PROXY_PORT", 9877);
/**
 * Who this server is, for status and for whoever its requests make wait.
 * TERM_PROGRAM alone ("tmux") named all eleven sessions the same on 2026-09-27;
 * the working directory tells them apart.
 */
const HOST_LABEL = process.env.MONORAIL_HOST_LABEL
  || `${path.basename(process.cwd())}@${process.env.TERM_PROGRAM || "claude"}`;
const CLIENT_LABEL = `${HOST_LABEL} pid ${process.pid}`;
/**
 * How long to keep retrying `busy` from a proxy older than protocol 3. By
 * default the request's own timeout: its turn may come at any point before.
 */
const BUSY_RETRY_MS: number | null = process.env.MONORAIL_BUSY_RETRY_MS ? envInt("MONORAIL_BUSY_RETRY_MS", 10_000) : null;
/** Overrides every per-type default timeout in DEFAULT_TIMEOUT_MS. */
const TIMEOUT_OVERRIDE_MS = process.env.MONORAIL_TIMEOUT_MS ? envInt("MONORAIL_TIMEOUT_MS", 30_000) : null;
/** Extra wait past the proxy's TTL, so the proxy's report (which names the cause) lands first. */
const SERVER_TIMEOUT_GRACE_MS = 2_000;
const RECONNECT_MIN_MS = envInt("MONORAIL_RECONNECT_MIN_MS", 250);
const RECONNECT_MAX_MS = envInt("MONORAIL_RECONNECT_MAX_MS", 10_000);
/** Don't start a proxy more often than this (per server) while none will stay up. */
const SPAWN_COOLDOWN_MS = envInt("MONORAIL_SPAWN_COOLDOWN_MS", 15_000);
/** MONORAIL_PROXY_SPAWN=0: never start a proxy, only connect to one (e.g. one run by launchd). */
const SPAWN_ALLOWED = process.env.MONORAIL_PROXY_SPAWN !== "0";
/**
 * MONORAIL_DIRECT=1: when no proxy can be reached, listen on WS_PORT for the
 * plugin directly (one session only). Off by default: a direct-mode server
 * holding the plugin port keeps every proxy other sessions start from binding
 * it, and it has no token or pairing checks.
 */
const DIRECT_ALLOWED = process.env.MONORAIL_DIRECT === "1";
/** How long a tool call waits for a reconnect in progress before failing. */
const LINK_WAIT_MS = envInt("MONORAIL_LINK_WAIT_MS", 3_000);
/** The proxy pings every heartbeat; this long without a word from it means the link is dead. */
const PROXY_SILENCE_MS = 3 * envInt("MONORAIL_HEARTBEAT_MS", 15_000);

let wsServer: WebSocketServer | null = null;
let directServers: WebSocketServer[] = [];
/** The socket requests go out on: the proxy in proxy mode, the plugin in direct mode. */
let connectedPlugin: WebSocket | null = null;
let pluginInfo: { name?: string; version?: string; connectedAt?: string; features?: string[]; fileName?: string | null } = {};
let currentSelection: { count: number; nodes: Array<{ id: string; name: string; type: string; width: number | null; height: number | null; parent: string | null }> } = { count: 0, nodes: [] };

type LinkMode = "starting" | "proxy" | "direct" | "degraded";
let linkMode: LinkMode = "starting";
/** From the proxy's `registered` reply: 1 for builds before request ids, 0 until it arrives. */
let proxyProtocol = 0;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let nextReconnectAt = 0;
let lastSpawnAt = 0;
let lastLinkError: string | null = null;
/** The proxy refused this server's registration (no or wrong token). */
let authError: string | null = null;
let lastProxyContact = 0;
let shuttingDown = false;
let linkWaiters: Array<() => void> = [];

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// =============================================================================
// REQUEST LAYER
// =============================================================================

class PluginRequestError extends Error {
  constructor(message: string, readonly code: RequestErrorCode, readonly retryable: boolean) {
    super(message);
    this.name = "PluginRequestError";
  }
}

type Outcome =
  | { kind: "reply"; msg: any }
  | { kind: "busy"; msg: any }
  | { kind: "error"; msg: any }
  | { kind: "timeout"; waitedMs: number }
  | { kind: "closed"; why: string }
  | { kind: "cancelled" };

interface PendingRequest {
  id: string;
  type: string;
  responseType: string;
  sentAt: number;
  timeoutMs: number;
  timer: ReturnType<typeof setTimeout>;
  settle: (o: Outcome) => void;
  /** Set when a protocol 3 proxy said the request is waiting its turn. */
  queued: { position: number; at: number; holder?: any } | null;
}

/** The tool call a request belongs to, so that cancelling the call withdraws the request. */
const callContext = new AsyncLocalStorage<{ signal?: AbortSignal }>();

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const done = () => { clearTimeout(t); signal?.removeEventListener("abort", done); resolve(); };
    const t = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

// Result types for each request (some imported from shared/types.ts)
// These are local types not in shared:
interface CapturedTemplate { template: any; nodeCount: number; }
interface InstantiateResult { success: boolean; newSlideId?: string; updated?: number; failed?: string[]; fontSubstitutions?: string[]; error?: string; }
interface CssResult { success: boolean; css?: Record<string, string>; raw?: any; error?: string; }
interface ExportResult { success: boolean; nodeId?: string; nodeName?: string; format?: string; data?: string; width?: number; height?: number; error?: string; }
interface ComponentInfoResult { success: boolean; node: { id: string; name: string; type: string }; isInstance?: boolean; mainComponent?: { id: string; name: string; description?: string }; componentSet?: { id: string; name: string; variantCount: number }; componentProperties?: Record<string, { type: string; value: string; options?: string[] }>; variants?: Array<{ id: string; name: string; properties: Record<string, string> }>; error?: string; }
interface FindResult { success: boolean; nodes?: Array<{ id: string; name: string; type: string; x: number; y: number; width: number; height: number; parentId: string | null; parentName: string | null }>; total?: number; truncated?: boolean; error?: string; }

/** Requests waiting for a reply, by requestId. */
const pendingRequests = new Map<string, PendingRequest>();
let requestSeq = 0;

function timeoutFor(type: string, requested?: unknown): number {
  const base = TIMEOUT_OVERRIDE_MS ?? DEFAULT_TIMEOUT_MS[type] ?? 30_000;
  return clampTimeout(requested ?? base, base);
}

function isLinkOpen(): boolean {
  return connectedPlugin !== null && connectedPlugin.readyState === WebSocket.OPEN;
}

/** Resolves true once a request can go out, waiting briefly for a reconnect in progress. */
function linkReady(waitMs = LINK_WAIT_MS): Promise<boolean> {
  if (isLinkOpen()) return Promise.resolve(true);
  if (waitMs <= 0 || shuttingDown) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(isLinkOpen()); };
    const timer = setTimeout(() => {
      linkWaiters = linkWaiters.filter((w) => w !== done);
      resolve(isLinkOpen());
    }, waitMs);
    linkWaiters.push(done);
  });
}

function linkUp(): void {
  const waiters = linkWaiters;
  linkWaiters = [];
  for (const w of waiters) w();
}

function notConnectedMessage(): string {
  if (linkMode === "direct") {
    return `Error: No Figma plugin connected. This session listens on ws://localhost:${WS_PORT} itself (direct mode): open Figma and run the Monorail plugin.`;
  }
  const next = reconnectTimer ? ` next try in ${secs(Math.max(0, nextReconnectAt - Date.now()))},` : "";
  return `Error: Not connected to the monorail proxy on ws://localhost:${PROXY_PORT}. Reconnecting (attempt ${reconnectAttempt},${next} last error: ${lastLinkError ?? "none"}). Retry shortly.`;
}

/**
 * Serialise requests inside this process when nobody else will: in direct mode
 * (no proxy), and behind a protocol 1 proxy, whose replies carry no ids and
 * so can only be matched when one request is out at a time.
 */
function localHolder(): Outcome | null {
  if (!(linkMode === "direct" || proxyProtocol < 2) || pendingRequests.size === 0) return null;
  const h = [...pendingRequests.values()][0];
  const ageMs = Date.now() - h.sentAt;
  return { kind: "busy", msg: { retryAfterMs: 250, holder: { type: h.type, label: CLIENT_LABEL, ageMs, ttlMs: h.timeoutMs, expiresInMs: Math.max(0, h.timeoutMs - ageMs) } } };
}

function sendOnce(message: Record<string, unknown> & { type: string }, timeoutMs: number, signal?: AbortSignal): Promise<Outcome> {
  return new Promise((resolve) => {
    const sock = connectedPlugin;
    // The link can close between linkReady() and here.
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      resolve({ kind: "closed", why: `the link closed before ${message.type} could be sent; retry the call` });
      return;
    }
    if (signal?.aborted) { resolve({ kind: "cancelled" }); return; }
    const id = `${process.pid}-${++requestSeq}`;
    const waitMs = timeoutMs + (linkMode === "proxy" ? SERVER_TIMEOUT_GRACE_MS : 0);
    const onAbort = () => {
      if (pendingRequests.get(id) !== p) return;
      // Withdraw it, so the plugin isn't held for a call nobody is waiting on.
      if (linkMode === "proxy" && proxyProtocol >= 3 && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: "cancel", requestId: id }));
      }
      p.settle({ kind: "cancelled" });
    };
    const p: PendingRequest = {
      id, type: message.type, responseType: RESPONSE_FOR[message.type], sentAt: Date.now(), timeoutMs, queued: null,
      timer: setTimeout(() => p.settle({ kind: "timeout", waitedMs: waitMs }), waitMs),
      settle: (o) => {
        if (pendingRequests.get(id) !== p) return;
        clearTimeout(p.timer);
        signal?.removeEventListener("abort", onAbort);
        pendingRequests.delete(id);
        resolve(o);
      },
    };
    pendingRequests.set(id, p);
    signal?.addEventListener("abort", onAbort, { once: true });
    sock.send(JSON.stringify({ ...message, requestId: id, timeoutMs, clientLabel: CLIENT_LABEL }), (err) => {
      if (err) p.settle({ kind: "closed", why: `could not send ${message.type} (${err.message})` });
    });
  });
}

function busyMessage(type: string, msg: any, tries: number, waitedMs: number): string {
  const h = msg?.holder;
  const who = h
    ? `${h.type} from "${h.label}" has held it for ${secs(h.ageMs ?? 0)}` +
      (typeof h.expiresInMs === "number" ? ` (released within ${secs(h.expiresInMs)})` : "")
    : "another session holds it (this proxy build doesn't say who)";
  return `${type}: the Figma plugin is busy: ${who}. Retried ${tries}× over ${secs(waitedMs)}, until this call's deadline; this is retryable, so try again shortly, or pass a longer timeout_ms.`;
}

function errorFromProxy(type: string, msg: any): PluginRequestError {
  const code: RequestErrorCode = typeof msg?.code === "string" ? msg.code : "PLUGIN_ERROR";
  const retryable = typeof msg?.retryable === "boolean" ? msg.retryable : false;
  const text = typeof msg?.message === "string" ? msg.message : "unknown error from the proxy";
  return new PluginRequestError(`${type}: ${text}`, code, retryable);
}

function pluginError(type: string, msg: any, fallback: string): PluginRequestError {
  return new PluginRequestError(`${type}: ${msg?.error || fallback}`, "PLUGIN_ERROR", false);
}

/** Shape each reply the way its tool handler expects it. */
function mapReply(type: string, p: any): unknown {
  switch (p.type) {
    case "exported":
      if (!p.ir) throw pluginError(type, p, "the plugin returned no deck IR");
      return p.ir as DeckIR;
    case "applied":
      if (p.success === false) throw pluginError(type, p, "the plugin could not apply the IR");
      return p;
    case "patched":
      if (p.success === false) throw pluginError(type, p, "the plugin could not apply the patch");
      return {
        updated: p.updated || 0, added: p.added || 0, deleted: p.deleted || 0,
        failed: p.failed || [], newElements: p.newElements || [], deletedElements: p.deletedElements || [],
      } satisfies PatchResult;
    case "template-captured":
      if (!p.template) throw pluginError(type, p, "the plugin returned no template");
      return { template: p.template, nodeCount: p.nodeCount || 0 } satisfies CapturedTemplate;
    case "instantiated":
      return {
        success: p.success, newSlideId: p.newSlideId, updated: p.updated, failed: p.failed,
        fontSubstitutions: p.fontSubstitutions, error: p.error,
      } satisfies InstantiateResult;
    case "slides-deleted":
      if (p.success === false) throw pluginError(type, p, "the plugin could not delete the slides");
      return { deleted: p.deleted || 0, failed: p.failed || [] } satisfies DeleteResult;
    case "slides-reordered":
      return { success: p.success, count: p.count, error: p.error } satisfies ReorderResult;
    case "screenshot-exported":
      return {
        success: p.success, slideId: p.slideId, slideName: p.slideName,
        base64: p.base64, width: p.width, height: p.height, error: p.error,
      } satisfies ScreenshotResult;
    case "primitives-applied":
      return {
        success: p.success, slideId: p.slideId, slideName: p.slideName,
        created: p.created, animated: p.animated, stepSlides: p.stepSlides, groups: p.groups,
        warnings: p.warnings, error: p.error,
      };
    case "css-extracted":
      return { success: p.success, css: p.css, raw: p.raw, error: p.error } satisfies CssResult;
    case "node-exported":
      return {
        success: p.success, nodeId: p.nodeId, nodeName: p.nodeName,
        format: p.format, data: p.data, width: p.width, height: p.height, error: p.error,
      } satisfies ExportResult;
    case "component-info":
      return {
        success: p.success, node: p.node, isInstance: p.isInstance, mainComponent: p.mainComponent,
        componentSet: p.componentSet, componentProperties: p.componentProperties,
        variants: p.variants, error: p.error,
      } satisfies ComponentInfoResult;
    case "nodes-found":
      return { success: p.success, nodes: p.nodes, total: p.total, truncated: p.truncated, error: p.error } satisfies FindResult;
    default:
      // motion-result, probe-result, styled-slide-created: the handler reads the message itself.
      return p;
  }
}

/**
 * Send one request to the Figma plugin and wait for its reply.
 *
 * Fails with a PluginRequestError whose message says which limit was hit:
 * BUSY (someone else held the plugin for the whole retry window),
 * PROXY_TTL_EXPIRED (the proxy gave up on the plugin), SERVER_TIMEOUT (this
 * server gave up, with no word from the proxy), PROXY_DISCONNECTED,
 * NO_PLUGIN, NOT_CONNECTED, or PLUGIN_ERROR.
 */
async function pluginRequest<T = any>(message: Record<string, unknown> & { type: string }, opts: { timeoutMs?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const type = message.type;
  const timeoutMs = timeoutFor(type, opts.timeoutMs);
  const signal = opts.signal ?? callContext.getStore()?.signal;
  const started = Date.now();
  // One deadline for the whole call: waiting for a busy plugin and the
  // plugin's own work both come out of timeoutMs.
  const deadline = started + timeoutMs;
  const busyDeadline = started + Math.min(BUSY_RETRY_MS ?? timeoutMs, timeoutMs);
  let busyTries = 0;
  let attempts = 0;
  const cancelled = () => new PluginRequestError(`${type}: cancelled by the caller; the request was withdrawn`, "CANCELLED", false);
  for (;;) {
    if (signal?.aborted) throw cancelled();
    if (!(await linkReady())) {
      throw new PluginRequestError(`${type}: ${notConnectedMessage().replace(/^Error: /, "")}`, "NOT_CONNECTED", true);
    }
    const left = attempts++ === 0 ? timeoutMs : Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
    const outcome = localHolder() ?? await sendOnce(message, left, signal);
    switch (outcome.kind) {
      case "reply":
        return mapReply(type, outcome.msg) as T;
      case "cancelled":
        throw cancelled();
      case "busy": {
        busyTries++;
        const hint = Number(outcome.msg?.retryAfterMs);
        const base = Number.isFinite(hint) ? Math.min(2000, Math.max(100, hint)) : 250;
        const wait = Math.round(base * (0.75 + Math.random() * 0.75));
        // Leave the last try enough time to be served.
        const room = Math.min(busyDeadline, deadline - MIN_TIMEOUT_MS) - Date.now();
        if (room > 0) {
          await abortableSleep(Math.min(wait, room), signal);
          continue;
        }
        throw new PluginRequestError(busyMessage(type, outcome.msg, busyTries, Date.now() - started), "BUSY", true);
      }
      case "error": {
        // An older proxy says NO_PLUGIN at once, even while the plugin is
        // reconnecting (about half a second): give it a moment. (A protocol 3
        // proxy waits for the plugin itself.)
        const code = outcome.msg?.code;
        const retryableGap = code === "NO_PLUGIN" || (code === "PLUGIN_DISCONNECTED" && !WRITE_REQUEST_TYPES.has(type));
        if (retryableGap && proxyProtocol < 3 && Date.now() - started < LINK_WAIT_MS && deadline - Date.now() > MIN_TIMEOUT_MS) {
          await abortableSleep(250, signal);
          continue;
        }
        throw errorFromProxy(type, outcome.msg);
      }
      case "timeout": {
        const why = linkMode !== "proxy" ? "server-side timeout"
          : proxyProtocol >= 2 ? `server-side timeout; the proxy should have reported its own ${secs(outcome.waitedMs - SERVER_TIMEOUT_GRACE_MS)} TTL first, so it may be unresponsive`
          : "server-side timeout; this proxy build has no request TTL";
        throw new PluginRequestError(
          `${type}: no reply from the Figma plugin within ${secs(outcome.waitedMs)} (${why}). If that was an edit, check Figma before retrying.`,
          "SERVER_TIMEOUT", true);
      }
      case "closed":
        throw new PluginRequestError(`${type}: ${outcome.why}`, "PROXY_DISCONNECTED", true);
    }
  }
}

// =============================================================================
// MESSAGE HANDLER (shared between direct mode and proxy mode)
// =============================================================================

let statusWaiters: Array<{ id: string; resolve: (s: any) => void }> = [];

function logIncoming(data: string): void {
  const shown = data.length > 400 ? `${data.slice(0, 400)}… (${data.length} chars)` : data;
  console.error(`[WebSocket] Received: ${shown}`);
}

function findPending(parsed: any): PendingRequest | undefined {
  if (typeof parsed.requestId === "string") return pendingRequests.get(parsed.requestId);
  const waiting = [...pendingRequests.values()];
  if (parsed.type === "busy" || parsed.type === "error") {
    // A protocol 1 proxy answers in order and we send one request at a time to it.
    return waiting.sort((a, b) => b.sentAt - a.sentAt)[0];
  }
  // A plugin or proxy without request ids: the oldest request waiting for this reply type.
  return waiting.filter((p) => p.responseType === parsed.type).sort((a, b) => a.sentAt - b.sentAt)[0];
}

function handlePluginMessage(data: string, sender: WebSocket) {
  lastProxyContact = Date.now();
  let parsed: any;
  try {
    parsed = JSON.parse(data);
  } catch {
    sender.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }
  if (!parsed || typeof parsed.type !== "string") return;

  // The proxy refused this server's registration. Requests on this socket get
  // the same explanation one by one; record it for monorail_status.
  if (parsed.type === "error" && parsed.requestType === "register") {
    authError = typeof parsed.message === "string" ? parsed.message : `the proxy refused registration (${parsed.code})`;
    console.error(`[WebSocket] Proxy refused registration: ${authError}`);
    return;
  }

  // A protocol 3 proxy is holding the request until the plugin is free. Keep waiting.
  if (parsed.type === "queued") {
    const p = typeof parsed.requestId === "string" ? pendingRequests.get(parsed.requestId) : undefined;
    if (p) p.queued = { position: Number(parsed.position) || 0, at: Date.now(), holder: parsed.holder };
    return;
  }

  if (parsed.type === "busy" || parsed.type === "error" || RESPONSE_TYPES.has(parsed.type)) {
    logIncoming(data);
    const p = findPending(parsed);
    if (!p) {
      console.error(`[WebSocket] ${parsed.type} matches no waiting request (a late reply to a call that already gave up?); ignored`);
      return;
    }
    p.settle({ kind: parsed.type === "busy" ? "busy" : parsed.type === "error" ? "error" : "reply", msg: parsed });
    return;
  }

  switch (parsed.type) {
    case "hello":
      pluginInfo = {
        name: parsed.plugin || "unknown",
        version: parsed.version || "unknown",
        connectedAt: new Date().toISOString(),
        features: Array.isArray(parsed.features) ? parsed.features : [],
        fileName: parsed.fileName ?? null,
      };
      // Only send hello-ack in direct mode (proxy handles it in proxy mode)
      if (linkMode === "direct") {
        sender.send(JSON.stringify({
          type: "hello-ack",
          server: "monorail-mcp",
          version: "0.3.0",
          protocol: PROTOCOL_VERSION,
          timestamp: new Date().toISOString(),
        }));
      }
      console.error(`[WebSocket] Hello from ${pluginInfo.name} v${pluginInfo.version}`);
      return;
    case "registered":
      proxyProtocol = typeof parsed.protocol === "number" ? parsed.protocol : 1;
      authError = null;
      console.error(`[WebSocket] Registered with proxy as ${parsed.id} (protocol ${proxyProtocol})`);
      return;
    case "status-response": {
      const i = statusWaiters.findIndex((w) => w.id === parsed.requestId);
      const w = i >= 0 ? statusWaiters.splice(i, 1)[0] : statusWaiters.shift();
      w?.resolve(parsed);
      return;
    }
    case "ping":
      sender.send(JSON.stringify({ type: "pong" }));
      return;
    case "selection-changed":
      currentSelection = { count: parsed.count || 0, nodes: parsed.nodes || [] };
      console.error(`[WebSocket] Selection: ${currentSelection.count} nodes`);
      return;
    default:
      logIncoming(data);
      console.error(`[WebSocket] Unknown message type: ${parsed.type}`);
  }
}

function queryProxyStatus(timeoutMs = 2000): Promise<any | null> {
  if (linkMode !== "proxy" || !isLinkOpen()) return Promise.resolve(null);
  const id = `status-${process.pid}-${++requestSeq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      statusWaiters = statusWaiters.filter((w) => w.id !== id);
      resolve(null);
    }, timeoutMs);
    statusWaiters.push({ id, resolve: (s) => { clearTimeout(timer); resolve(s); } });
    connectedPlugin!.send(JSON.stringify({ type: "status-query", requestId: id }));
  });
}

/** The code to paste into the plugin window, or null if the token can't be read. */
function pairingCode(): string | null {
  try { return pairingCodeFor(readOrCreateToken()); } catch { return null; }
}

/** The text of monorail_status. */
async function statusText(): Promise<string> {
  const selectionText = currentSelection.count > 0
    ? `\n  Selection: ${currentSelection.count} node(s)\n` + currentSelection.nodes.map(n => {
        const dims = n.width != null && n.height != null ? ` ${n.width}×${n.height}` : '';
        return `    - ${n.type} "${n.name}"${dims}${n.parent ? ` (in ${n.parent})` : ''}`;
      }).join('\n')
    : '\n  Selection: none';
  const me = `  This session: ${CLIENT_LABEL}`;
  const howToConnect = "\n\nTo connect:\n1. Open Figma\n2. Run the Monorail plugin\n3. It connects on open. Plugin builds from 2026-09 on also reconnect by themselves when the proxy restarts.";

  if (linkMode === "direct") {
    if (!isLinkOpen()) {
      return `✗ No plugin connected\n  Mode: direct (no proxy): this session listens on ws://localhost:${WS_PORT}\n${me}${howToConnect}`;
    }
    const waiting = [...pendingRequests.values()];
    return `✓ Figma plugin connected (direct)\n  Plugin: ${pluginInfo.name || "unknown"} ${pluginInfo.version || ""}\n  Connected at: ${pluginInfo.connectedAt || "unknown"}\n  Mode: direct (no proxy): ws://localhost:${WS_PORT}\n${me}\n  In flight: ${waiting.length ? waiting.map(p => `${p.type} for ${secs(Date.now() - p.sentAt)}`).join(", ") : "nothing"}${selectionText}`;
  }

  if (!isLinkOpen()) return `✗ ${notConnectedMessage().replace(/^Error: /, "")}\n${me}`;
  if (authError) return `✗ The monorail proxy refused this session: ${authError}\n${me}`;

  const st = await queryProxyStatus();
  const lines: string[] = [];
  const plugins: any[] = Array.isArray(st?.plugins) ? st.plugins : [];
  const pluginCount: number = typeof st?.pluginCount === "number" ? st.pluginCount : (pluginInfo.name ? 1 : 0);
  const usable = plugins.filter((p) => p.routable !== false);

  if (pluginCount > 0 && (plugins.length === 0 || usable.length > 0)) {
    lines.push("✓ Figma plugin connected (via proxy)");
  } else if (pluginCount > 0) {
    lines.push("✗ A Figma plugin is connected, but it isn't paired, so it gets no requests");
  } else {
    lines.push("✗ No Figma plugin connected to the proxy");
  }
  if (plugins.length > 0) {
    for (const p of plugins) {
      const feats = Array.isArray(p.features) && p.features.length ? ` · features: ${p.features.join(", ")}` : "";
      const pairing = p.paired === true ? " · paired" : p.paired === false ? " · not paired" : "";
      lines.push(`  Plugin: ${p.plugin || "unknown"} ${p.version || ""}${p.fileName ? ` · file "${p.fileName}"` : ""}${p.pageName ? ` · page "${p.pageName}"` : ""} · connected ${p.connectedAt}${pairing}${feats}`);
    }
    if (plugins.some((p) => !Array.isArray(p.features) || !p.features.includes("serial"))) {
      lines.push("  Note: this plugin build predates the request queue, cancelling and pairing (2026-09-28). Re-run the plugin in Figma once to load them.");
    }
    const unpaired = plugins.filter((p) => p.paired === false);
    if (unpaired.length > 0) {
      const code = pairingCode();
      const where = code ? `paste this code into the Monorail plugin window (Pair): ${code}` : `the pairing code can't be made: ${tokenPath()} is unreadable`;
      if (st?.pairingEnforced) {
        lines.push(`  Pairing: required. Requests only go to paired plugins; ${where}`);
      } else if (unpaired.some((p) => Array.isArray(p.features) && p.features.includes("pairing"))) {
        lines.push(`  Pairing: not set up. So that no other page can pose as the plugin, ${where}`);
      }
    }
  } else if (pluginCount > 0) {
    lines.push(`  Plugin: ${pluginInfo.name || "unknown"} ${pluginInfo.version || ""}`);
  }

  if (st && typeof st.protocol === "number") {
    lines.push(`  Proxy: ws://localhost:${PROXY_PORT} · pid ${st.pid} · monorail-proxy ${st.version} (protocol ${st.protocol}) · up ${fmtDuration(st.uptimeMs ?? 0)} · ${st.upstreamCount} session(s)`);
  } else if (st) {
    lines.push(`  Proxy: ws://localhost:${PROXY_PORT} · an older build (protocol 1): it can't say who holds the plugin and has no request TTL. Restart it to upgrade. ${st.upstreamCount} session(s)`);
  } else {
    lines.push(`  Proxy: ws://localhost:${PROXY_PORT} · connected, but it didn't answer a status query within 2s`);
  }
  lines.push(me);

  const held: any[] = Array.isArray(st?.inflight) ? st.inflight : [];
  if (st && Array.isArray(st.inflight)) {
    lines.push(held.length === 0
      ? "  Plugin lock: free"
      : held.map((h) => h.state === "overdue"
          ? `  Plugin lock: ${h.type} from "${h.label}" for ${secs(h.ageMs)}, past its ${secs(h.ttlMs)} TTL (a write: held until it answers, at most ${secs(h.expiresInMs)} more)`
          : `  Plugin lock: ${h.type} from "${h.label}" for ${secs(h.ageMs)} (released within ${secs(h.expiresInMs)})`).join("\n"));
  }
  const queued: any[] = Array.isArray(st?.queue) ? st.queue : [];
  if (queued.length > 0) {
    lines.push(`  Queue: ${queued.length} waiting: ` + queued.slice(0, 5).map((q) => `${q.type} from "${q.label}" for ${secs(q.waitedMs)}`).join(", ") + (queued.length > 5 ? ", …" : ""));
  }
  const expired: any[] = Array.isArray(st?.recentExpired) ? st.recentExpired.slice(0, 3) : [];
  if (expired.length > 0) {
    lines.push("  Recent TTL expiries (the plugin never answered):");
    for (const e of expired) lines.push(`    - ${e.type} from "${e.label}" after ${secs(e.ageMs)} at ${e.at}`);
  }

  return lines.join("\n") + selectionText + (pluginCount === 0 ? howToConnect : "");
}

// =============================================================================
// CONNECTION MODES
// =============================================================================

function failAllPending(why: string): void {
  for (const p of [...pendingRequests.values()]) p.settle({ kind: "closed", why });
}

/** Direct mode: a plugin connected to this server's own WebSocket server. */
function setupPluginSocket(ws: WebSocket) {
  connectedPlugin = ws;
  ws.on("message", (data) => handlePluginMessage(data.toString(), ws));
  ws.on("close", () => {
    console.error("[WebSocket] Plugin connection closed");
    if (connectedPlugin === ws) {
      connectedPlugin = null;
      pluginInfo = {};
      failAllPending("the Figma plugin disconnected before replying. If that was an edit, check Figma before retrying: it may have been applied.");
    }
  });
  ws.on("error", (err) => {
    console.error("[WebSocket] Error:", err.message);
  });
  linkUp();
}

/** Proxy mode: this server's socket to the proxy. Reconnects when it closes. */
function setupProxySocket(ws: WebSocket) {
  connectedPlugin = ws;
  linkMode = "proxy";
  proxyProtocol = 0;
  reconnectAttempt = 0;
  lastLinkError = null;
  authError = null;
  lastProxyContact = Date.now();
  ws.on("message", (data) => handlePluginMessage(data.toString(), ws));
  ws.on("ping", () => { lastProxyContact = Date.now(); });
  ws.on("close", () => {
    if (connectedPlugin !== ws) return;
    connectedPlugin = null;
    pluginInfo = {};
    proxyProtocol = 0;
    console.error("[WebSocket] Proxy connection closed; reconnecting");
    failAllPending("the connection to the monorail proxy closed before a reply (the proxy restarted or died). This server is reconnecting: retry the call. If it was an edit, check Figma first: it may have been applied.");
    scheduleReconnect();
  });
  ws.on("error", (err) => {
    console.error("[WebSocket] Proxy socket error:", err.message);
  });
  let token: string | undefined;
  try {
    token = readOrCreateToken();
  } catch (e) {
    authError = `this server can't read or create ${tokenPath()} (${(e as Error).message}), so the proxy won't accept it`;
    console.error(`[WebSocket] ${authError}`);
  }
  ws.send(JSON.stringify({ type: "register", id: `mcp-${process.pid}`, label: CLIENT_LABEL, protocol: PROTOCOL_VERSION, token }));
  linkUp();
}

/** Connect to a proxy that is already listening. Resolves false (and records why) if none is. */
function connectToProxy(): Promise<boolean> {
  return new Promise((resolve) => {
    // 127.0.0.1, not localhost: the proxy listens on loopback only, and IPv4 always.
    const ws = new WebSocket(`ws://127.0.0.1:${PROXY_PORT}`);
    let settled = false;
    const fail = (why: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lastLinkError = why;
      ws.removeAllListeners();
      ws.on("error", () => { /* already failed */ });
      ws.terminate();
      resolve(false);
    };
    const timer = setTimeout(() => fail("connect timed out after 2s"), 2000);
    ws.once("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeAllListeners("error");
      console.error(`[WebSocket] Connected to proxy on port ${PROXY_PORT}`);
      setupProxySocket(ws);
      resolve(true);
    });
    ws.on("error", (err: NodeJS.ErrnoException) => fail(err.code || err.message));
  });
}

/** Direct mode (MONORAIL_DIRECT=1): listen for the plugin ourselves, on loopback, with the proxy's handshake checks. */
async function startDirectServer(): Promise<boolean> {
  const verifyClient = (info: { req: import("http").IncomingMessage }) =>
    isLoopbackHost(info.req.headers.host) && downstreamOriginAllowed(info.req.headers.origin);
  const listenOn = (host: string) => new Promise<WebSocketServer | null>((resolve) => {
    const srv = new WebSocketServer({ port: WS_PORT, host, verifyClient });
    srv.once("listening", () => resolve(srv));
    srv.once("error", (err: NodeJS.ErrnoException) => {
      console.error(`[WebSocket] Can't listen on [${host}]:${WS_PORT} (${err.code ?? err.message})`);
      srv.close();
      resolve(null);
    });
  });
  const primary = await listenOn(LOOPBACK_ADDRESSES[0]);
  if (!primary) return false;
  const servers = [primary];
  const v6 = await listenOn(LOOPBACK_ADDRESSES[1]);
  if (v6) servers.push(v6);
  for (const srv of servers) {
    srv.on("connection", (ws) => {
      console.error("[WebSocket] Plugin connected!");
      setupPluginSocket(ws);
    });
    srv.on("error", (err) => console.error("[WebSocket] Server error:", err.message));
  }
  wsServer = primary;
  directServers = servers;
  linkMode = "direct";
  console.error(`[WebSocket] Direct server listening on ws://localhost:${WS_PORT} (loopback)`);
  return true;
}

function proxyLogPath(): string {
  if (process.env.MONORAIL_PROXY_LOG) return process.env.MONORAIL_PROXY_LOG;
  return process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Logs", "monorail-proxy.log")
    : path.join(os.tmpdir(), "monorail-proxy.log");
}

/** Mode 3: Spawn proxy, then connect as upstream */
async function spawnProxyAndConnect(): Promise<boolean> {
  lastSpawnAt = Date.now();
  console.error("[WebSocket] Spawning proxy...");
  // The proxy outlives this server, so give it a log file rather than our stderr.
  let out: number | "ignore" = "ignore";
  try {
    const logPath = proxyLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    out = fs.openSync(logPath, "a");
  } catch {
    out = "ignore";
  }
  try {
    const proxyPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "proxy.js");
    const child = spawn(process.execPath, [proxyPath], { detached: true, stdio: ["ignore", out, out] });
    child.unref();
    console.error(`[WebSocket] Proxy spawned (pid ${child.pid})`);
  } catch (e) {
    console.error("[WebSocket] Failed to spawn proxy:", (e as Error).message);
    return false;
  } finally {
    if (typeof out === "number") fs.closeSync(out);
  }

  // Wait for it (or for whichever proxy won a spawn race) to be ready
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    if (await connectToProxy()) return true;
  }
  console.error("[WebSocket] Proxy spawned but failed to connect");
  return false;
}

function scheduleReconnect(): void {
  if (shuttingDown || reconnectTimer || isLinkOpen() || linkMode === "direct") return;
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.min(reconnectAttempt, 16));
  const delay = Math.round(base * (0.5 + Math.random() * 0.5));
  reconnectAttempt++;
  nextReconnectAt = Date.now() + delay;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void reconnect();
  }, delay);
  reconnectTimer.unref();
}

async function reconnect(): Promise<void> {
  if (shuttingDown || isLinkOpen()) return;
  const attempt = reconnectAttempt;
  if (await connectToProxy()) {
    console.error(`[WebSocket] Reconnected to proxy (attempt ${attempt})`);
    return;
  }
  // Nothing listening: start a proxy, unless one was started moments ago.
  if (SPAWN_ALLOWED && lastLinkError === "ECONNREFUSED" && Date.now() - lastSpawnAt >= SPAWN_COOLDOWN_MS) {
    if (await spawnProxyAndConnect()) {
      console.error(`[WebSocket] Reconnected to a new proxy (attempt ${attempt})`);
      return;
    }
  }
  scheduleReconnect();
}

// A proxy that stops answering without closing (a half-open socket after
// sleep, a wedged process) would otherwise hold this link forever.
setInterval(() => {
  if (linkMode === "proxy" && isLinkOpen() && Date.now() - lastProxyContact > PROXY_SILENCE_MS) {
    console.error(`[WebSocket] No word from the proxy for ${secs(Date.now() - lastProxyContact)}; dropping the link`);
    connectedPlugin!.terminate();
  }
}, Math.max(1000, Math.floor(PROXY_SILENCE_MS / 3))).unref();

/** Startup sequence: connect to proxy → spawn proxy → (direct, if MONORAIL_DIRECT=1) → keep retrying */
async function startConnection() {
  // 1. Try connecting to existing proxy
  if (await connectToProxy()) {
    console.error("[WebSocket] Mode: proxy client");
    return;
  }

  // 2. No proxy — spawn one, then connect
  if (SPAWN_ALLOWED && await spawnProxyAndConnect()) {
    console.error("[WebSocket] Mode: proxy client (spawned)");
    return;
  }

  // 3. Only if asked: listen for the plugin ourselves (single session)
  if (DIRECT_ALLOWED && await startDirectServer()) {
    console.error("[WebSocket] Mode: direct server (MONORAIL_DIRECT=1)");
    return;
  }

  // 4. Degraded — no Figma connection yet; keep looking for (and starting) a proxy
  linkMode = "degraded";
  console.error("[WebSocket] Mode: degraded (no Figma connection); retrying the proxy in the background");
  scheduleReconnect();
}

function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[WebSocket] ${reason}; shutting down`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  failAllPending("the MCP server is shutting down");
  try { connectedPlugin?.close(); } catch { /* closing anyway */ }
  for (const srv of directServers) srv.close();
  process.exit(0);
}

// The MCP client closing stdin means this session is gone. Exit, rather than
// keep reconnecting to (and respawning) a proxy on behalf of nobody.
process.stdin.on("end", () => shutdown("stdin closed"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start the server
async function main() {
  await startConnection();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Monorail MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
