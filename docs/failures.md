# Monorail: Findings & Failures Log

Learnings from iteration. Each entry notes what we discovered and how it shapes the path forward.

---

## Format

```
### [Date] - [Brief description]

**What we found:** 
**Impact:** 
**Path forward:** 
```

---

## Entries

### 2026-01-11 - Figma MCP doesn't support Slides

**What we found:** The official Figma MCP server only supports Figma Design, FigJam, and Figma Make. When we tried to read a Figma Slides file (`/slides/` URL), it returned "This figma file could not be accessed."

The docs explicitly list supported file types:
- ✅ Figma Design
- ✅ FigJam  
- ✅ Figma Make
- ❌ Figma Slides (not mentioned, confirmed doesn't work)

**Impact:** Can't use existing Figma MCP for reading Slides. Need alternative approach.

**Path forward:** Either build custom REST API integration, or accept plugin-only approach.

---

### 2026-01-11 - Figma REST API is read-only for design content

**What we found:** The Figma REST API can read file structure, node properties, export images, manage comments and variables — but it cannot create or modify design content (frames, text nodes, etc.).

Write capabilities in REST API:
- ✅ Comments
- ✅ Variables
- ✅ Webhooks
- ✅ Dev resources
- ❌ Design content (frames, text, shapes)

**Impact:** Even if we build custom MCP integration, we can only READ via REST API. WRITES require the Plugin API.

**Path forward:** Plugin is required for writes. REST API could supplement for reads (direct Claude access without copy/paste export).

---

### 2026-01-11 - Plugin development has friction

**What we found:** Figma plugins run in a sandboxed iframe. They can't receive external messages easily. The workflow is:
1. User must manually import plugin from manifest (one-time)
2. User must manually open plugin each session
3. Data transfer is via copy/paste or file upload
4. Plugin can't "listen" for external events without WebSocket hackery

**Impact:** The "Claude and human collaborate seamlessly" vision has friction in practice. Every IR transfer requires manual action.

**Path forward:** 
- Accept friction for v0 (clipboard workflow)
- Or implement WebSocket bridge (plugin connects to local server, receives pushes)
- Or pivot to HTML-first (Claude controls output directly, Figma only for final polish)

---

### 2026-01-11 - Meta: Should have set up Ralph Wiggum approach first

**What we found:** We dove into implementation before setting up proper persistent context. The Ralph Wiggum methodology prescribes:
- Persistent plan (PLAN.md)
- Clean sessions with completion criteria
- Findings log (this file)

Without this, we risk losing context across sessions and repeating discoveries.

**Impact:** Mild — we caught it early. But a reminder to set up structure before diving in.

**Path forward:** Structure now in place. Future sessions start by reading PLAN.md.

---

### 2026-01-11 - WebSocket bridge spike: Server side works

**What we found:** 
- ✅ WebSocket server can run alongside MCP stdio transport
- ✅ Node.js `ws` package works cleanly
- ✅ Hello/hello-ack handshake protocol works
- ✅ Server listens on `ws://localhost:9876`
- ⏳ **Untested:** Whether Figma plugin iframe can connect to localhost WebSocket

**What we built:**
1. MCP server now starts WebSocket server on port 9876
2. Plugin UI has WebSocket client code (auto-connects, shows status)
3. `monorail_connection_status` tool to check if plugin is connected

**Key research question ANSWERED:** 
> ✅ **YES — Figma plugin iframe CAN connect to `ws://localhost:9876`**

Tested in actual Figma Slides. Connection works, hello-ack handshake succeeds, UI shows green "Connected" status.

**Technical notes:**
- Plugin UI runs in iframe with browser APIs (WebSocket available)
- Connection status shown in plugin UI (green/yellow/red indicator)
- Protocol: JSON messages with `type` field for routing
- Reconnection works (tested connect/disconnect cycles)

**Path forward:** Build out the bridge — implement `monorail_push_ir` and `monorail_pull_ir` tools for copy/paste-free workflow.

---

### 2026-01-11 - Multiple MCP processes can cause WebSocket conflicts

**What we found:** When debugging push/pull tools, we discovered that multiple monorail-mcp processes can end up running:
1. A manually-started process (for testing)
2. Cursor's auto-started MCP process

Only one can bind to port 9876. If the wrong one gets it, the plugin connects to one process while MCP tool calls go to another — causing "No plugin connected" errors even when the UI shows green "Connected".

**Symptoms:**
- Plugin shows "Connected to MCP server" ✓
- `monorail_connection_status` says "No plugin connected" ✗
- `lsof -i :9876` shows a different PID than expected

**Resolution:**
```bash
# Find processes
ps aux | grep monorail-mcp

# Kill the rogue one
kill <PID>

# Cursor's MCP will restart and bind the port
```

**Path forward:** 
- Don't manually start the server when testing MCP tools (Cursor manages it)
- If issues occur, check for multiple processes
- Consider adding port conflict detection/logging to server startup

---

### 2026-01-11 - IR schema mismatch: flat vs nested content

**What we found:** During dog-fooding, Claude generated IR with content fields directly on the slide object:
```json
{"id":"slide-1","archetype":"title","headline":"Monorail"}  // WRONG
```
Instead of nested inside `content`:
```json
{"id":"slide-1","archetype":"title","content":{"headline":"Monorail"}}  // RIGHT
```

The plugin crashed with `cannot read property 'headline' of undefined` because `slide.content` was undefined.

**Impact:** Malformed IR creates orphan/blank slides that require manual cleanup. Claude doesn't get useful error feedback.

**Path forward:**
- Add JSON schema validation in `monorail_push_ir` before sending to plugin
- Add `monorail://ir-schema` resource so Claude can reference the spec
- Consider having plugin validate and return clear errors instead of crashing

---

### 2026-01-11 - Plugin uses raw absolute positioning, not Figma Slides best practices

**What we found:** Our plugin creates text nodes with hardcoded x/y coordinates:
```typescript
await addText(parent, c.headline, 200, 380, 72, true, COLORS.white, 1520, 'headline');
```

Figma Slides actually supports more sophisticated layout:
- **Auto Layout** — text reflows when content changes, maintains spacing
- **Grid systems** — rows/columns for structured layouts
- **Components** — reusable slide templates, update once → everywhere
- **Templates** — built-in branding consistency

Our approach is the simplest thing that works, but it means:
1. Text can overflow if content is too long (no auto-reflow)
2. Changing archetypes destroys human positioning (full re-render)
3. No connection to user's existing design system

**Impact:** Formatting is functional but not polished. Production decks require manual cleanup.

**Path forward:**
- v0/v1: Accept limitation, absolute positioning is fine for iteration
- Future: Research Plugin API support for Auto Layout frames
- Future: Consider generating slides as Component instances
- Added `preserveLayout` feature to plan — update content without re-rendering

---

### 2026-01-11 - Archetypes bypass Figma's native template system

**What we found:** Figma Slides has a built-in template system we're completely ignoring:

1. **Templates** define brand colors, fonts, and slide layouts
2. **Slide layouts** within templates are essentially what we call "archetypes"
3. **Template styles** (colors, fonts) auto-apply when users pick layouts
4. **Teams can publish custom templates** for org-wide consistency

Our plugin hardcodes everything:
- `COLORS` object with our dark theme
- Font: Inter (hardcoded)
- Archetypes as code with magic-number positions

We generate raw text nodes instead of using Figma's layout system.

**Impact:** 
- Users can't use their existing brand/templates
- No connection to org design systems
- Monorail decks look like "Monorail decks", not "their decks"

**Path forward:**
- Explore three approaches:
  - **Opinionated**: Ship a Monorail template users install
  - **Adaptive**: Read user's existing template, match their style
  - **Hybrid**: Default template + brand detection
- Research: Can Plugin API read template styles? Generate layout instances?
- Added to plan as design decision to explore

---

### 2026-01-11 - HTML output is far more beautiful than Figma output

**What we found:** The HTML deck (`examples/monorail-deck-v0.html`) demonstrates design capabilities our Figma plugin doesn't match:

| Feature | HTML Deck | Figma Plugin |
|---------|-----------|--------------|
| Call-and-response | Grid-aligned Q→A rows | Body text with newlines |
| Loop diagram | Visual boxes with arrows | Text only |
| Callouts | Styled box with border | Doesn't exist |
| Bullet styling | Red dot accents | Plain `•` character |
| Quote | Q/A in different colors | Single string |
| Backgrounds | Gradients | Flat color |

**Root cause:** Claude is fluent in HTML/CSS but weak in Figma Plugin API. We're routing through its weakest channel.

**The asymmetry:**
```
Claude's fluency:  HTML/CSS ████████████  Figma API █████░░░░░░
Design fidelity:   HTML     ████████████  Figma     █████░░░░░░
```

**Impact:** We can co-create content but not design. The rendered output is functional, not beautiful.

**Path forward:**
- First: Audit Figma Plugin API capabilities (what's actually possible?)
- Then decide architecture:
  - Enrich IR to express design
  - HTML-first workflow
  - Separation (human designs, Claude fills)
  - Teach Claude Figma primitives
  - HTML → Figma converter
- Goal: Aspire to co-create design, not just content

---

### 2026-01-11 - Plugin API Capabilities Audit: The gap is USAGE, not capability

**What we found:** The Figma Plugin API can do FAR more than we're using. We audited capabilities against what the HTML deck demonstrates:

| Capability | API Support | Current Plugin | Gap |
|------------|-------------|----------------|-----|
| **Auto Layout** | ✅ `layoutMode`, `itemSpacing`, `padding*` | ❌ Absolute positioning | Not using |
| **Rounded corners** | ✅ `cornerRadius`, individual corners | ❌ None | Not using |
| **Borders/strokes** | ✅ `strokes`, `strokeWeight`, `dashPattern` | ⚠️ Chart placeholder only | Minimal |
| **Gradients** | ✅ `GRADIENT_LINEAR`, `gradientStops` | ❌ Flat fills only | Not using |
| **Lines with arrows** | ✅ `createLine()` + `strokeCap = 'ARROW_LINES'` | ❌ None | Not using |
| **Circles/ellipses** | ✅ `createEllipse()` | ⚠️ Timeline markers only | Minimal |
| **SVG import** | ✅ `createNodeFromSvg(svgString)` | ❌ None | **KEY CAPABILITY** |
| **Component instances** | ✅ `component.createInstance()` | ❌ Raw nodes only | Not using |
| **Read local styles** | ✅ `getLocalPaintStylesAsync()`, etc. | ❌ Hardcoded colors | Not using |

**The key insight:** We blamed the API for HTML→Figma quality gap, but the API CAN do it — we're just not using it.

**Auto Layout example (from API docs):**
```javascript
const frame = figma.createFrame();
frame.layoutMode = 'VERTICAL';
frame.primaryAxisSizingMode = 'AUTO';
frame.counterAxisSizingMode = 'AUTO';
frame.paddingTop = frame.paddingBottom = 10;
frame.itemSpacing = 10;
```

**Gradient example:**
```javascript
rect.fills = [{
  type: 'GRADIENT_LINEAR',
  gradientStops: [
    { position: 0, color: { r: 0.06, g: 0.06, b: 0.1 } },
    { position: 1, color: { r: 0.1, g: 0.1, b: 0.18 } }
  ],
  gradientTransform: [[1, 0, 0], [0, 1, 0]]
}];
```

**SVG import (game changer):**
```javascript
const svg = `<svg><circle cx="50" cy="50" r="40" fill="red"/></svg>`;
const node = figma.createNodeFromSvg(svg);
```

**Connectors/arrows in FigJam only:** `createConnector()` works in FigJam, not Figma Slides. For arrows we need `createLine()` + `strokeCap = 'ARROW_LINES'`.

**Impact:** The path to design co-creation is clear — enrich the plugin, not change architecture.

**Path forward (recommended priority):**

1. **Short-term: Auto Layout archetypes** (High impact, moderate effort)
   - Wrap archetype content in Auto Layout frames
   - Text reflows instead of overflowing
   - Spacing maintains automatically
   - Example: Bullets become `VERTICAL` frame with `itemSpacing`

2. **Short-term: Styled containers** (High impact, low effort)  
   - Add `cornerRadius` to frames
   - Add gradient backgrounds for title slides
   - Add accent borders to callouts
   - Match the HTML deck's visual polish

3. **Medium-term: SVG diagrams** (High impact, moderate effort)
   - Add `diagram?: string` field to IR (SVG string)
   - Claude generates diagrams as SVG (its strong channel!)
   - Plugin uses `createNodeFromSvg()` to render
   - Enables: flowcharts, loops, connectors, icons

4. **Medium-term: Read user's styles** (Medium impact, moderate effort)
   - Use `getLocalPaintStylesAsync()` to find user's brand colors
   - Use `getLocalTextStylesAsync()` for font preferences
   - Adapt generated content to match user's design system

5. **Long-term: Component-based generation** (High impact, high effort)
   - Create Monorail component library (or ship one)
   - Generate slides as component instances
   - Users customize the library → all decks update
   - Aligns with how teams actually use Figma

**HTML → Figma conversion:**
- No native HTML import in Plugin API
- But SVG import covers the key gap (diagrams, visual elements)
- For pure HTML conversion, third-party tools exist (html.to.design, etc.)
- Recommendation: Don't build an HTML parser; leverage SVG for visuals

---

### 2026-01-11 - Archetype detection: Direct children vs recursive

**What we found:** The `analyzeSlideContent()` function was only looking at direct text node children of a slide. But when slides use Auto Layout containers (like `bullets-container`), the actual text nodes are nested inside frames. This caused bullets slides to export as `archetype: "unknown"` on round-trip.

**Root cause:** Pattern-matching on direct children misses text inside layout containers.

```typescript
// OLD: Only sees direct children
const directTextNodes = children.filter(n => n.type === 'TEXT');

// NEW: Also checks frame names for Monorail-created content
if (frameNames.has('bullets-container')) return detectBullets(...);
```

**Impact:** Round-trip fidelity was broken. Push a bullets slide, pull it back → "unknown".

**Fix:** Rebuilt archetype detection to use two-phase approach:
1. **Frame-based detection** (for Monorail-created slides) — check for named containers
2. **Pattern-matching fallback** (for non-Monorail slides) — analyze text content

This mirrors how `detectExistingArchetype()` already worked for update-in-place detection.

**Lesson learned:** When building export/import round-trip systems, always test the full cycle. Export alone looked fine; import alone looked fine; but the round-trip revealed the mismatch.

---

### 2026-01-11 - Pending request state: Fragmented variables invite bugs

**What we found:** The MCP server had 14 separate variables for tracking pending WebSocket requests:

```typescript
let pendingPullResolve: ((ir: DeckIR) => void) | null = null;
let pendingPullReject: ((error: Error) => void) | null = null;
// ... 12 more for patch, capture, clone, delete, reorder, create ...
```

Each request type had its own resolve/reject pair with duplicated timeout logic. This was error-prone and hard to extend.

**Impact:** 
- Easy to forget to clear state after timeout
- Hard to add new request types
- Code duplication across 7 request handlers

**Fix:** Consolidated into generic `PendingRequest<T>` manager:

```typescript
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<RequestType, PendingRequest<any>>();
```

Three utility functions handle all request lifecycle:
- `createPendingRequest<T>(type, timeoutMsg)` — create with auto-timeout
- `resolvePendingRequest<T>(type, result)` — resolve and clean up
- `hasPendingRequest(type)` — check if request in progress

**Lesson learned:** When you see parallel structures with the same shape, consolidate into a generic. The Map + generic pattern is cleaner than N × 2 variables.
