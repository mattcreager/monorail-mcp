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
