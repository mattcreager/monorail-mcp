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

---

### 2026-01-13 - Stale MCP server process: Hard to diagnose connection failures

**What we found:** When restarting development, an old MCP server process was still running from a previous session. The new Cursor-managed MCP server couldn't bind to port 9876 (or did bind but plugin was connected to the stale one). This caused:

1. `monorail_status` returned "No plugin connected" 
2. Plugin UI showed "Connected" (green) — to the WRONG server
3. No obvious error message indicating the real problem

**Diagnostic friction:**
- The MCP server doesn't log "port already in use" errors clearly
- Plugin shows "connected" even when connected to a zombie server
- Had to manually run `lsof -i :9876` to discover the stale process
- Then `kill <PID>` and reload Cursor

**Root cause:** MCP servers persist beyond Cursor sessions. If you quit Cursor without cleanly terminating them, they linger.

**What would help:**
1. **Server instance ID** — Plugin UI should show which server instance it's connected to (timestamp, PID, or UUID)
2. **Port conflict detection** — MCP server should warn loudly if port 9876 is already in use
3. **Startup logging** — "WebSocket server started on :9876" should be visible, not just stderr
4. **Connection health check** — `monorail_status` could ping the plugin and verify round-trip

**Impact:** 10+ minutes of debugging what looked like a code bug but was actually a stale process.

**Path forward:** 
- Added to PLAN.md Gap: "Multi-instance debugging"
- Consider adding server UUID to hello handshake so plugin can detect server restart
- Consider binding to random port and advertising it (avoids conflicts entirely)

---

### 2026-01-12 - Figma plugin hot reloads on code.js change

**What we found:** When you run `npm run build` (which compiles `code.ts` → `code.js`), the Figma plugin automatically hot reloads. No need to manually close and reopen the plugin.

**Impact:** Much faster iteration cycle during plugin development. Build → test immediately, no manual steps.

**How it works:** Figma watches the plugin's `code.js` file. When the file changes on disk, Figma reloads the plugin code while keeping the UI open and WebSocket connection alive.

**Caveat:** The WebSocket connection may briefly disconnect and reconnect during hot reload. The MCP server handles reconnection gracefully.

**Path forward:** Document this in the development workflow. Use `npm run watch` (which runs `tsc --watch`) for continuous compilation during development.

---

### 2026-01-14 - Primitives: Background layering issue

**What we found:** When using `monorail_primitives` to create a canvas, adding a `rect` for background (e.g., `{"op": "rect", "name": "bg", "fill": "#0f0f1a", ...}`) layers ON TOP of the slide's existing background. In Figma Slides, the slide itself already has a background color. My background rect sat on top, and when colors weren't being applied (see hex color bug below), the result was white-on-white-on-white.

**Impact:** Slide 21 appeared completely blank in screenshots — white background rect, white card rects, white text. Only discovered the issue by running `monorail_capture` and seeing all colors were `#fafafa`.

**Debugging insight:** Screenshots alone don't reveal color issues. A `monorail_pull` or `monorail_capture` would have shown the color values and caught this immediately.

**Path forward:**
- Primitives tool should NOT add background rect when targeting existing slides (slide already has background)
- Or: add `setSlideBackground()` option to primitives instead of layering a rect
- Workflow: after complex primitives push, run `capture` to verify colors before trusting screenshot

---

### 2026-01-14 - Primitives: Hex color parsing not working

**What we found:** The `resolveColor()` function in the primitives handler only supported:
- Named colors (`"white"`, `"bg"`, etc.)
- RGB objects (`{r: 0.1, g: 0.1, b: 0.1}`)

Hex strings like `"#1a1a2e"` were falling through to the default case and returning white with a console warning: `Unknown color: #1a1a2e, defaulting to white`.

**Impact:** All 53 elements in the first canvas attempt rendered in white/near-white, making the slide appear blank.

**Fix applied:** Added hex parsing to `resolveColor()` in `code.js`:
```javascript
if (typeof colorRef === "string" && colorRef.startsWith("#")) {
  let hex = colorRef.slice(1);
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length === 6) {
    return { r: parseInt(hex.slice(0,2),16)/255, g: parseInt(hex.slice(2,4),16)/255, b: parseInt(hex.slice(4,6),16)/255 };
  }
}
```

**Tech debt:** This fix was applied directly to `code.js`. The primitives handler exists ONLY in `code.js`, not in `code.ts`. The TypeScript source is out of sync — needs to be ported.

**Path forward:**
- Port primitives handler from `code.js` to `code.ts`
- Rebuild to ensure TypeScript source is the source of truth

---

### 2026-01-14 - Primitives: Arrow rendering is complex vector paths

**What we found:** The `arrow` primitive draws arrows using vector paths (shaft + head geometry via `setVectorNetworkAsync()`). This works but is heavier than necessary for simple connector arrows.

**What user expected:** Simple lines with arrow stroke caps, similar to Figma's native line + arrowhead.

**API context:** Figma has `strokeCap = 'ARROW_LINES'` for lines, but this only adds small chevron-style caps. For larger arrowheads, the vector approach may be necessary. Need to audit options.

**Path forward:**
- [ ] Add simpler arrow option using line + strokeCap for basic connectors
- [ ] Keep vector arrows for when larger/custom arrowheads are needed
- [ ] Document which to use when in primitives tool description

---

### 2026-01-14 - Primitives handler only in code.js (tech debt)

**What we found:** The `apply-primitives` message handler (lines 2762-3024 in `code.js`) was added directly to the compiled JavaScript, not to the TypeScript source (`code.ts`). This means:
- `code.ts` doesn't have primitives support
- Running `npm run build` would overwrite the primitives code
- The TypeScript source is incomplete/out of sync

**Impact:** Can't safely rebuild plugin from TypeScript without losing primitives functionality.

**Path forward:**
- [ ] Port the entire primitives handler from `code.js` to `code.ts`
- [ ] Ensure build process compiles TS → JS correctly
- [ ] Add to PLAN.md as immediate tech debt fix

---

### 2026-01-14 - Patch delete operations failing

**What we found:** When attempting to delete elements from a slide using `monorail_patch` with `action: "delete"`, the operation failed silently:
```
✓ Patched: no changes
Failed: 17:1849, 17:1850
```

The node IDs appeared valid (from slide creation output), but delete didn't work. Unclear if this is:
- A bug in the delete handler
- Wrong node IDs (from a different slide?)
- Elements that can't be deleted (part of slide structure?)

**Impact:** Had to work around by creating new slides instead of removing elements from existing ones.

**Root cause (Session 33):** The delete handler was working correctly. The issue was **stale IDs** — user created elements with primitives, then recreated the slide (getting new IDs), then tried to delete with the old IDs.

**Fix (Session 33):**
- [x] Improved error messages: "Node IDs may be stale — try pulling fresh IDs first"
- [x] Server response now includes actionable guidance with common causes
- [x] Plugin console logs include action context (delete/add/edit)

**The delete handler itself is correct.** The fix is better AI DX: guide Claude to pull fresh IDs before patching.

---

### 2026-01-14 - Pull output too large for practical use

**What we found:** Running `monorail_pull` on a deck with ~20 slides produced 8,507 lines of output. Finding specific node IDs required grep/search through a temp file. The output was written to disk because it exceeded reasonable response size.

**Impact:** 
- Can't quickly find the node ID you need to patch
- Have to use grep with patterns to locate elements
- Slows down the patch workflow

**What would help:**
1. **Slide filtering** — `monorail_pull` with `slide_id` param to get just one slide
2. **Summary mode** — return just slide IDs + names without full element trees
3. **Element search** — find nodes by text content or name

**Path forward:** Already in PLAN.md Gap. Consider adding `slide_id` filter as quick win.

---

### 2026-01-14 - Primitives + Patch loop is the winning workflow

**What we found:** In an extended design session (4 complex slides), the most productive workflow was:
1. Create slide with `monorail_primitives` (full layout + all elements)
2. Screenshot to see result
3. Iterate with `monorail_patch` on specific text nodes
4. Screenshot again

This loop is fast because:
- Primitives handles initial layout (no manual positioning)
- Patch updates just the text that needs changing
- Screenshot gives instant visual feedback
- No need to recreate entire slide for text tweaks

**What made it work:**
- Named elements in primitives (e.g., `"name": "h1-q"`) make node IDs predictable
- Patch preserves all styling — just updates text content
- Hex colors working correctly (fixed in Session 30)

**Impact:** Built 4 dense, multi-section slides in one session without significant friction. Primitives + patch is production-ready for complex layouts.

**Recommendation:** Document this workflow as the recommended approach for custom slide design.

---

### 2026-01-14 - Text arrows as connector workaround

**What we found:** Instead of using the `arrow` primitive (which creates complex vector paths), we used Unicode arrow characters in text:
- `→` for horizontal flow
- `↓` for vertical flow  
- `↻` for cycle/loop indication

These render cleanly, don't require additional primitives, and are easy to position as part of text elements.

**Impact:** Avoided the complexity of vector arrows entirely. Slides look clean with text-based arrows.

**When to use what:**
- Text arrows (`→`): Simple flow indicators, inline with labels
- Vector arrows: When you need custom styling, curves, or precise positioning

**Path forward:** Document text arrows as recommended approach for simple connectors. Keep vector arrows for complex diagrams.

---

### 2026-01-14 - Session insight: One slide = one conversation

**What we found:** When building the GTM Operating Canvas, we initially tried to pack everything onto one slide:
- Strategic framing (The Window, The Claim)
- Weekly tactics (This Week's Bet)
- Q1 plan (Timeline, RACI)
- Scoreboard (Critical Path status)

The result was dense and hard to use. The user asked: "What conversation are we having when this slide is up?"

**The insight:** Each slide should serve ONE conversation:
| Slide | Conversation | Cadence |
|-------|--------------|---------|
| Position | "What do we believe?" | Stable |
| This Week | "What's the bet?" | Weekly (Mon) |
| Scoreboard | "What moved?" | Weekly (Fri) |
| Plan | "Who owns what?" | Monthly |

**Impact:** Redesigned from 1 packed canvas to 4 focused slides. Each has a clear purpose and update cadence.

**Path forward:** This is a content/strategy insight, not a tool issue. But worth documenting as a pattern for future GTM/operating canvas work.
