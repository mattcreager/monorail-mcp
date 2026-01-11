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
  rows?: string[][];
  items?: string[];
  chart?: { type: string; placeholder?: boolean };
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
    name: "monorail-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "monorail_create_deck",
        description:
          "Create a new deck IR from a JSON specification. The IR defines slides with archetypes, content, and status. Returns the validated IR and any warnings.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ir: {
              type: "string",
              description:
                "The deck IR as a JSON string with slides array. Each slide needs: id, archetype (title/section/big-idea/bullets/two-column/quote/chart/timeline/comparison/summary), status (draft/locked/stub), and content object.",
            },
          },
          required: ["ir"],
        },
      },
      {
        name: "monorail_update_slides",
        description:
          "Update existing slides in the current deck. Only modifies slides that changed and respects locked status.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ir: {
              type: "string",
              description: "The updated deck IR as JSON string",
            },
          },
          required: ["ir"],
        },
      },
      {
        name: "monorail_get_deck",
        description: "Get the current deck IR that was last created or updated.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "monorail_validate_ir",
        description:
          "Validate an IR spec against archetype constraints. Returns warnings for any violations (word limits, missing fields, unknown archetypes).",
        inputSchema: {
          type: "object" as const,
          properties: {
            ir: {
              type: "string",
              description: "The deck IR as JSON string to validate",
            },
          },
          required: ["ir"],
        },
      },
      {
        name: "monorail_preview",
        description:
          "Generate an HTML preview file for the deck. The preview shows all slides rendered in a browser-viewable format with a Copy IR button for pasting into Figma plugin.",
        inputSchema: {
          type: "object" as const,
          properties: {
            output_path: {
              type: "string",
              description:
                "Path where to save the HTML preview file. If not provided, saves to ./preview.html",
            },
          },
        },
      },
      {
        name: "monorail_connection_status",
        description:
          "Check if the Figma plugin is connected via WebSocket. Returns connection state and plugin info if connected.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "monorail_push_ir",
        description:
          "Push IR directly to the connected Figma plugin. The plugin will receive the IR and can optionally auto-apply it to the deck. Requires plugin to be connected via WebSocket.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ir: {
              type: "string",
              description: "The deck IR as a JSON string to send to the plugin",
            },
            autoApply: {
              type: "boolean",
              description:
                "If true, the plugin will automatically apply the IR to the deck. If false, it just populates the input field.",
            },
          },
          required: ["ir"],
        },
      },
      {
        name: "monorail_pull_ir",
        description:
          "Request the current deck IR from the connected Figma plugin. The plugin will export the current slides and return the IR. Requires plugin to be connected via WebSocket.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "monorail_create_deck": {
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

      // Validate
      const warnings = validateIR(ir);
      currentIR = ir;

      const warningText =
        warnings.length > 0
          ? `\n\nWarnings:\n${warnings.map((w) => `- [${w.severity}] ${w.slideId}: ${w.message}`).join("\n")}`
          : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `Created deck with ${ir.slides.length} slides.${warningText}\n\nUse monorail_preview to generate an HTML preview, or copy the IR to the Figma plugin.`,
          },
        ],
      };
    }

    case "monorail_update_slides": {
      const irString = args?.ir as string;
      if (!irString) {
        return {
          content: [{ type: "text" as const, text: "Error: No IR provided" }],
          isError: true,
        };
      }

      let newIR: DeckIR;
      try {
        newIR = JSON.parse(irString);
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

      if (!currentIR) {
        currentIR = newIR;
      } else {
        // Merge: update non-locked slides
        const existingMap = new Map(currentIR.slides.map((s) => [s.id, s]));

        for (const newSlide of newIR.slides) {
          const existing = existingMap.get(newSlide.id);
          if (existing && existing.status === "locked") {
            // Keep locked slide as-is
            continue;
          }
          existingMap.set(newSlide.id, newSlide);
        }

        currentIR = {
          deck: newIR.deck || currentIR.deck,
          slides: Array.from(existingMap.values()),
        };
      }

      const warnings = validateIR(currentIR);
      const warningText =
        warnings.length > 0
          ? `\n\nWarnings:\n${warnings.map((w) => `- [${w.severity}] ${w.slideId}: ${w.message}`).join("\n")}`
          : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated deck. Now has ${currentIR.slides.length} slides.${warningText}`,
          },
        ],
      };
    }

    case "monorail_get_deck": {
      if (!currentIR) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No deck currently loaded. Use monorail_create_deck first.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(currentIR, null, 2),
          },
        ],
      };
    }

    case "monorail_validate_ir": {
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

      const warnings = validateIR(ir);

      if (warnings.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `✓ IR is valid. ${ir.slides.length} slides, all constraints satisfied.`,
            },
          ],
        };
      }

      const errors = warnings.filter((w) => w.severity === "error");
      const warns = warnings.filter((w) => w.severity === "warning");

      return {
        content: [
          {
            type: "text" as const,
            text: `Validation complete. ${errors.length} errors, ${warns.length} warnings.\n\n${warnings.map((w) => `[${w.severity.toUpperCase()}] ${w.slideId} - ${w.field}: ${w.message}`).join("\n")}`,
          },
        ],
      };
    }

    case "monorail_preview": {
      if (!currentIR) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No deck to preview. Use monorail_create_deck first.",
            },
          ],
          isError: true,
        };
      }

      const outputPath = (args?.output_path as string) || "./preview.html";
      const html = generatePreviewHTML(currentIR);

      try {
        const resolvedPath = path.resolve(outputPath);
        fs.writeFileSync(resolvedPath, html, "utf-8");

        return {
          content: [
            {
              type: "text" as const,
              text: `Preview saved to: ${resolvedPath}\n\nOpen this file in a browser to see the deck. Use the "Copy IR for Figma" button to get the IR for the Figma plugin.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error saving preview: ${e instanceof Error ? e.message : "unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "monorail_connection_status": {
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

    case "monorail_push_ir": {
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

      const autoApply = args?.autoApply === true;

      // Send to plugin
      connectedPlugin!.send(
        JSON.stringify({
          type: "push-ir",
          ir: ir,
          autoApply: autoApply,
        })
      );

      // Also update currentIR in server state
      currentIR = ir;

      return {
        content: [
          {
            type: "text" as const,
            text: `✓ Pushed ${ir.slides.length} slides to Figma plugin${autoApply ? " (auto-apply enabled)" : ""}\n\nThe IR is now in the plugin.${autoApply ? " It will be applied automatically." : " Click 'Apply to Deck' in the plugin to render."}`,
          },
        ],
      };
    }

    case "monorail_pull_ir": {
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
      if (pendingPullResolve) {
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

      // Create a promise to wait for the exported response
      const pullPromise = new Promise<DeckIR>((resolve, reject) => {
        pendingPullResolve = resolve;
        pendingPullReject = reject;

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingPullResolve) {
            pendingPullResolve = null;
            pendingPullReject = null;
            reject(new Error("Timeout waiting for plugin export"));
          }
        }, 30000);
      });

      // Send export request to plugin
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
          "The 10 constrained slide templates with word limits and usage guidance.",
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
5. Iterate with feedback
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
`,

    "monorail://ir-format": `# IR Format Reference

The IR (Intermediate Representation) is a JSON format for defining decks.

\`\`\`json
{
  "deck": {
    "title": "Deck Title"
  },
  "slides": [
    {
      "id": "unique-id",
      "archetype": "title|section|big-idea|bullets|two-column|quote|chart|timeline|comparison|summary",
      "status": "draft|locked|stub",
      "content": {
        // archetype-specific fields
      },
      "speaker_notes": "Optional notes for presenter"
    }
  ]
}
\`\`\`

## Status Values

- **draft**: Work in progress, can be modified
- **locked**: Finalized, won't be overwritten
- **stub**: Placeholder, needs content

## Example

\`\`\`json
{
  "deck": { "title": "Project Proposal" },
  "slides": [
    {
      "id": "slide-1",
      "archetype": "title",
      "status": "draft",
      "content": {
        "headline": "Project Alpha",
        "subline": "Transforming how we work"
      }
    },
    {
      "id": "slide-2",
      "archetype": "bullets",
      "status": "draft",
      "content": {
        "headline": "Three key benefits",
        "bullets": [
          "50% faster delivery",
          "Lower operational costs",
          "Happier customers"
        ]
      }
    }
  ]
}
\`\`\`
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

// Pending pull request (for monorail_pull_ir)
let pendingPullResolve: ((ir: DeckIR) => void) | null = null;
let pendingPullReject: ((error: Error) => void) | null = null;

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
          
          if (pendingPullResolve && parsed.ir) {
            pendingPullResolve(parsed.ir as DeckIR);
            pendingPullResolve = null;
            pendingPullReject = null;
          }
        } else if (parsed.type === "applied") {
          // Plugin confirmed it applied IR
          console.error(`[WebSocket] Plugin applied ${parsed.count} slides`);
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
