#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";

// =============================================================================
// TYPES
// =============================================================================

interface SlideContent {
  headline?: string;
  subline?: string;
  bullets?: string[];
  quote?: string;
  attribution?: string;
  takeaway?: string;
  left?: { title: string; body: string };
  right?: { title: string; body: string };
  stages?: Array<{ label: string; description?: string }>;
  columns?: string[];
  video_url?: string;
  caption?: string;
  rows?: string[][];
  items?: string[];
  chart?: { type: string; placeholder?: boolean };
  // Position Cards archetype (Keycard-style)
  eyebrow?: string;
  cards?: Array<{
    label: string;
    title: string;
    body: string;
    badge?: string;
    badge_color?: 'green' | 'cyan' | 'orange';
  }>;
  features?: Array<{ label: string; description: string }>;
  // Visual element (diagram, icon, etc.)
  visual?: {
    type: 'svg' | 'cycle';
    // For SVG type
    content?: string;  // Raw SVG string
    // For cycle type (native Figma rendering)
    nodes?: string[];  // Labels for each node in the cycle
    colors?: Array<'cyan' | 'green' | 'orange' | 'pink' | 'purple' | 'blue' | 'white'>;  // Color for each node
    icons?: Array<'presence' | 'lightbulb' | 'refresh' | 'chart' | 'magnet' | 'rocket' | 'target' | 'users' | 'check' | 'star'>;  // Icon for each node
    // Common options
    position?: 'right' | 'below' | 'center';  // Where to place relative to text content
    width?: number;   // Optional width in pixels
    height?: number;  // Optional height in pixels
  };
}

interface Slide {
  id: string;
  archetype: string;
  status: "draft" | "locked" | "stub";
  content: SlideContent;
  speaker_notes?: string;
}

interface DeckIR {
  deck?: { title: string };
  slides: Slide[];
}

interface ValidationWarning {
  slideId: string;
  field: string;
  message: string;
  severity: "warning" | "error";
}

// =============================================================================
// TEMPLATE EXTRACTION TYPES
// =============================================================================

interface CapturedNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: any[];
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: any;
  letterSpacing?: any;
  children?: CapturedNode[];
}

interface TemplateSlot {
  id: string;                    // Figma node ID
  role: string;                  // Inferred role: section_label, headline, accent_text, etc.
  depth: number;                 // Nesting depth in tree
  bounds: { x: number; y: number; width: number; height: number };
  // Text styling (for TEXT nodes)
  text?: {
    sample: string;              // First 50 chars of text content
    fontSize: number;
    fontFamily: string;
    fontStyle: string;
    color?: { r: number; g: number; b: number };
  };
  // Frame styling (for container slots)
  frame?: {
    fills: any[];
    strokes: any[];
    cornerRadius?: number;
    layoutMode?: string;
    itemSpacing?: number;
  };
  parentName: string;            // Name of parent frame (for context)
}

interface ComplexRegion {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  nodeCount: number;             // How many nodes inside
  reason: string;                // Why it's marked complex
}

interface ExtractedTemplate {
  source_slide_id: string;
  source_slide_name: string;
  slots: TemplateSlot[];
  complex_regions: ComplexRegion[];
  background?: any;              // Slide background fill
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

interface ColorToken {
  name: string;
  rgb: { r: number; g: number; b: number };
  hex: string;
  usage: string[];  // Where this color was found
}

interface FontToken {
  family: string;
  style: string;
  sizes: number[];  // All sizes seen
  usage: string[];  // What roles use this font
}

interface DesignSystem {
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
// HTML PREVIEW GENERATOR
// =============================================================================

function generatePreviewHTML(ir: DeckIR): string {
  const title = ir.deck?.title || "Untitled Deck";

  const slideHTML = ir.slides
    .map((slide, index) => {
      const statusBadge =
        slide.status === "locked"
          ? '<span class="badge locked">🔒 Locked</span>'
          : slide.status === "stub"
            ? '<span class="badge stub">📝 Stub</span>'
            : "";

      let contentHTML = "";

      switch (slide.archetype) {
        case "title":
          contentHTML = `
          <div class="slide-content title-slide">
            <h1>${escapeHtml(slide.content.headline || "")}</h1>
            ${slide.content.subline ? `<p class="subline">${escapeHtml(slide.content.subline)}</p>` : ""}
          </div>`;
          break;

        case "section":
          contentHTML = `
          <div class="slide-content section-slide">
            <h1>${escapeHtml(slide.content.headline || "")}</h1>
          </div>`;
          break;

        case "big-idea":
          contentHTML = `
          <div class="slide-content big-idea-slide">
            <h1>${escapeHtml(slide.content.headline || "")}</h1>
            <p class="subline">${escapeHtml(slide.content.subline || "")}</p>
          </div>`;
          break;

        case "bullets":
          contentHTML = `
          <div class="slide-content bullets-slide">
            <h2>${escapeHtml(slide.content.headline || "")}</h2>
            <ul>
              ${(slide.content.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("\n")}
            </ul>
          </div>`;
          break;

        case "two-column":
          contentHTML = `
          <div class="slide-content two-column-slide">
            <h2>${escapeHtml(slide.content.headline || "")}</h2>
            <div class="columns">
              <div class="column left">
                <h3>${escapeHtml(slide.content.left?.title || "")}</h3>
                <p>${escapeHtml(slide.content.left?.body || "")}</p>
              </div>
              <div class="column right">
                <h3>${escapeHtml(slide.content.right?.title || "")}</h3>
                <p>${escapeHtml(slide.content.right?.body || "")}</p>
              </div>
            </div>
          </div>`;
          break;

        case "quote":
          contentHTML = `
          <div class="slide-content quote-slide">
            <blockquote>"${escapeHtml(slide.content.quote || "")}"</blockquote>
            <cite>— ${escapeHtml(slide.content.attribution || "")}</cite>
          </div>`;
          break;

        case "chart":
          contentHTML = `
          <div class="slide-content chart-slide">
            <h2>${escapeHtml(slide.content.headline || "")}</h2>
            <div class="chart-placeholder">[Chart: ${slide.content.chart?.type || "unknown"}]</div>
            ${slide.content.takeaway ? `<p class="takeaway">${escapeHtml(slide.content.takeaway)}</p>` : ""}
          </div>`;
          break;

        case "timeline":
          contentHTML = `
          <div class="slide-content timeline-slide">
            <h2>${escapeHtml(slide.content.headline || "")}</h2>
            <div class="timeline">
              ${(slide.content.stages || [])
                .map(
                  (s) => `
                <div class="stage">
                  <div class="stage-label">${escapeHtml(s.label)}</div>
                  ${s.description ? `<div class="stage-desc">${escapeHtml(s.description)}</div>` : ""}
                </div>
              `
                )
                .join("")}
            </div>
          </div>`;
          break;

        case "comparison":
          contentHTML = `
          <div class="slide-content comparison-slide">
            <h2>${escapeHtml(slide.content.headline || "")}</h2>
            <table>
              <thead>
                <tr>${(slide.content.columns || []).map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${(slide.content.rows || [])
                  .map(
                    (row) => `
                  <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`;
          break;

        case "summary":
          contentHTML = `
          <div class="slide-content summary-slide">
            <h1>${escapeHtml(slide.content.headline || "")}</h1>
            <ul class="summary-items">
              ${(slide.content.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
            </ul>
          </div>`;
          break;

        default:
          contentHTML = `
          <div class="slide-content unknown-slide">
            <h2>${escapeHtml(slide.content.headline || slide.archetype)}</h2>
            <p class="unknown-notice">Unknown archetype: ${escapeHtml(slide.archetype)}</p>
          </div>`;
      }

      return `
      <div class="slide" data-archetype="${slide.archetype}" data-id="${slide.id}">
        <div class="slide-header">
          <span class="slide-number">${index + 1}</span>
          <span class="slide-archetype">${slide.archetype}</span>
          ${statusBadge}
        </div>
        ${contentHTML}
        ${slide.speaker_notes ? `<div class="speaker-notes"><strong>Notes:</strong> ${escapeHtml(slide.speaker_notes)}</div>` : ""}
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Monorail Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #111;
      color: #fff;
      min-height: 100vh;
      padding: 40px;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid #333;
    }
    
    h1.deck-title {
      font-size: 28px;
      font-weight: 700;
    }
    
    .deck-title::before {
      content: "🚝 ";
    }
    
    .controls {
      display: flex;
      gap: 12px;
    }
    
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .btn-primary {
      background: #0d99ff;
      color: white;
    }
    
    .btn-primary:hover {
      background: #0b87e0;
    }
    
    .btn-secondary {
      background: #333;
      color: #fff;
    }
    
    .btn-secondary:hover {
      background: #444;
    }
    
    .slides-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
      gap: 30px;
    }
    
    .slide {
      background: #0f0f14;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #222;
    }
    
    .slide-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #1a1a1f;
      border-bottom: 1px solid #222;
      font-size: 13px;
    }
    
    .slide-number {
      background: #333;
      color: #999;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }
    
    .slide-archetype {
      color: #666;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    
    .badge {
      margin-left: auto;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
    }
    
    .badge.locked {
      background: rgba(255, 204, 0, 0.15);
      color: #ffcc00;
    }
    
    .badge.stub {
      background: rgba(100, 100, 255, 0.15);
      color: #8888ff;
    }
    
    .slide-content {
      padding: 40px;
      min-height: 300px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    /* Title slide */
    .title-slide h1 {
      font-size: 48px;
      font-weight: 700;
      color: #fef3c7;
      margin-bottom: 16px;
    }
    
    .title-slide .subline {
      font-size: 20px;
      color: #9ca3af;
    }
    
    /* Section slide */
    .section-slide h1 {
      font-size: 56px;
      font-weight: 700;
      color: #fff;
    }
    
    /* Big idea slide */
    .big-idea-slide h1 {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.2;
    }
    
    .big-idea-slide .subline {
      font-size: 18px;
      color: #9ca3af;
      line-height: 1.5;
    }
    
    /* Bullets slide */
    .bullets-slide h2 {
      font-size: 28px;
      margin-bottom: 24px;
    }
    
    .bullets-slide ul {
      list-style: none;
    }
    
    .bullets-slide li {
      font-size: 20px;
      padding: 12px 0;
      padding-left: 24px;
      position: relative;
      color: #d1d5db;
    }
    
    .bullets-slide li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #0d99ff;
    }
    
    /* Two-column slide */
    .two-column-slide h2 {
      font-size: 28px;
      margin-bottom: 32px;
    }
    
    .two-column-slide .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }
    
    .two-column-slide .column h3 {
      font-size: 18px;
      margin-bottom: 12px;
    }
    
    .two-column-slide .column.left h3 {
      color: #dc2626;
    }
    
    .two-column-slide .column.right h3 {
      color: #fef3c7;
    }
    
    .two-column-slide .column p {
      font-size: 16px;
      color: #9ca3af;
      line-height: 1.5;
    }
    
    /* Quote slide */
    .quote-slide {
      text-align: center;
    }
    
    .quote-slide blockquote {
      font-size: 28px;
      font-style: italic;
      line-height: 1.4;
      margin-bottom: 24px;
      color: #f3f4f6;
    }
    
    .quote-slide cite {
      font-size: 16px;
      color: #6b7280;
    }
    
    /* Chart slide */
    .chart-slide h2 {
      font-size: 24px;
      margin-bottom: 24px;
    }
    
    .chart-placeholder {
      background: #1f1f24;
      border: 2px dashed #333;
      border-radius: 8px;
      padding: 60px;
      text-align: center;
      color: #666;
      margin-bottom: 20px;
    }
    
    .chart-slide .takeaway {
      font-size: 16px;
      color: #9ca3af;
      text-align: center;
    }
    
    /* Timeline slide */
    .timeline-slide h2 {
      font-size: 24px;
      margin-bottom: 32px;
    }
    
    .timeline {
      display: flex;
      gap: 20px;
    }
    
    .timeline .stage {
      flex: 1;
      padding: 20px;
      background: #1a1a1f;
      border-radius: 8px;
      border-left: 3px solid #0d99ff;
    }
    
    .timeline .stage-label {
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .timeline .stage-desc {
      font-size: 14px;
      color: #9ca3af;
    }
    
    /* Comparison slide */
    .comparison-slide h2 {
      font-size: 24px;
      margin-bottom: 24px;
    }
    
    .comparison-slide table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .comparison-slide th,
    .comparison-slide td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #333;
    }
    
    .comparison-slide th {
      background: #1a1a1f;
      font-weight: 600;
      color: #fef3c7;
    }
    
    .comparison-slide td {
      color: #d1d5db;
    }
    
    /* Summary slide */
    .summary-slide h1 {
      font-size: 40px;
      color: #fef3c7;
      margin-bottom: 32px;
    }
    
    .summary-slide .summary-items {
      list-style: none;
    }
    
    .summary-slide .summary-items li {
      font-size: 20px;
      padding: 16px 0;
      border-bottom: 1px solid #222;
      color: #d1d5db;
    }
    
    /* Unknown slide */
    .unknown-slide .unknown-notice {
      color: #ef4444;
      font-size: 14px;
      margin-top: 16px;
    }
    
    /* Speaker notes */
    .speaker-notes {
      padding: 16px 20px;
      background: #1a1a1f;
      border-top: 1px solid #222;
      font-size: 13px;
      color: #6b7280;
    }
    
    /* Toast notification */
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #22c55e;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s;
    }
    
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    
    /* IR Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .modal-overlay.show {
      display: flex;
    }
    
    .modal {
      background: #1a1a1f;
      border-radius: 12px;
      width: 90%;
      max-width: 800px;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .modal-header {
      padding: 20px;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .modal-header h2 {
      font-size: 18px;
    }
    
    .modal-body {
      padding: 20px;
      overflow: auto;
      flex: 1;
    }
    
    .modal-body pre {
      background: #0f0f14;
      padding: 20px;
      border-radius: 8px;
      overflow: auto;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    
    .modal-footer {
      padding: 20px;
      border-top: 1px solid #333;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    
    @media (max-width: 700px) {
      .slides-container {
        grid-template-columns: 1fr;
      }
      
      .slide-content {
        padding: 24px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1 class="deck-title">${escapeHtml(title)}</h1>
    <div class="controls">
      <button class="btn-secondary" onclick="showIR()">View IR</button>
      <button class="btn-primary" onclick="copyIR()">Copy IR for Figma</button>
    </div>
  </header>
  
  <div class="slides-container">
    ${slideHTML}
  </div>
  
  <div class="toast" id="toast">Copied to clipboard!</div>
  
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <div class="modal-header">
        <h2>Deck IR (JSON)</h2>
        <button class="btn-secondary" onclick="hideIR()">Close</button>
      </div>
      <div class="modal-body">
        <pre id="ir-content"></pre>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" onclick="copyIR(); hideIR();">Copy & Close</button>
      </div>
    </div>
  </div>
  
  <script>
    const IR_DATA = ${JSON.stringify(ir, null, 2)};
    
    function showIR() {
      document.getElementById('ir-content').textContent = JSON.stringify(IR_DATA, null, 2);
      document.getElementById('modal').classList.add('show');
    }
    
    function hideIR() {
      document.getElementById('modal').classList.remove('show');
    }
    
    async function copyIR() {
      try {
        await navigator.clipboard.writeText(JSON.stringify(IR_DATA, null, 2));
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      } catch (e) {
        alert('Failed to copy: ' + e.message);
      }
    }
    
    // Close modal on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideIR();
    });
    
    // Close modal on overlay click
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') hideIR();
    });
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
          "Pull the current deck state from Figma. Returns slides with all elements, their Figma node IDs, text content, positions, and styling. Use this to see what's in the deck before making changes. The 'elements' array contains node IDs you can target with monorail_patch.",
        inputSchema: {
          type: "object" as const,
          properties: {},
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
          "Patch specific text elements by Figma node ID. This is the core editing tool — modify individual elements without re-rendering slides. Get element IDs from monorail_pull (the 'elements' array). Preserves all styling, positioning, and surrounding content.",
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
                        description: "Figma node ID (from elements array)",
                      },
                      text: {
                        type: "string",
                        description: "New text content for this element",
                      },
                    },
                    required: ["target", "text"],
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
    ],
  };
});

// Handle tool calls (9 total)
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

      // Create pending request and send to plugin
      const pullPromise = createPendingRequest<DeckIR>('pull', "Timeout waiting for plugin export");
      connectedPlugin!.send(JSON.stringify({ type: "request-export" }));

      try {
        const ir = await pullPromise;
        
        // Update currentIR in server state
        currentIR = ir;

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Pulled deck from Figma\n\n${JSON.stringify(ir, null, 2)}`,
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
        
        const failedText = result.failed.length > 0 
          ? `\n\nFailed to patch: ${result.failed.join(", ")}`
          : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Patched ${result.updated} elements${failedText}`,
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

// Result types for each request
interface PatchResult { updated: number; failed: string[]; }
interface CapturedTemplate { template: any; nodeCount: number; }
interface InstantiateResult { success: boolean; newSlideId?: string; updated?: number; failed?: string[]; fontSubstitutions?: string[]; error?: string; }
interface CreateResult { success: boolean; slideId?: string; error?: string; }
interface DeleteResult { deleted: number; failed: string[]; }
interface ReorderResult { success: boolean; count?: number; error?: string; }
interface ScreenshotResult { success: boolean; slideId?: string; slideName?: string; base64?: string; width?: number; height?: number; error?: string; }

// Type-safe request type keys
type RequestType = 'pull' | 'patch' | 'capture' | 'instantiate' | 'create' | 'delete' | 'reorder' | 'screenshot';

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
          console.error(`[WebSocket] Patched ${parsed.updated} elements, ${parsed.failed?.length || 0} failed`);
          resolvePendingRequest<PatchResult>('patch', {
            updated: parsed.updated || 0,
            failed: parsed.failed || [],
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
