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
