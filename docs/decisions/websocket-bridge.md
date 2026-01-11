# Decision: WebSocket Bridge

**Date:** 2026-01-11  
**Status:** Implemented ✅  
**Context:** Session 4 discussion on user consumption model and development workflow

---

## Problem Statement

The current workflow requires manual copy/paste between Claude and Figma plugin:

```
Claude generates IR → User copies → Opens Figma plugin → Pastes → Clicks Apply
                                                                      ↓
User copies exported IR ← Opens plugin ← Switches to Figma ← Sees result
```

This friction breaks the "seamless collaboration" promise and slows iteration.

---

## Why WebSocket is High Priority

### 1. UX Improvement (obvious)
Remove copy/paste entirely. Claude can push IR directly, pull exports automatically.

### 2. Development Acceleration (key insight)

With WebSocket, Claude can help debug the plugin:

```
Current debugging:
  Edit code → Build → Open Figma → Open plugin → Paste IR → See result → Check console → Repeat

With WebSocket + MCP tools:
  Claude: "Let me send test IR and see what happens"
        → monorail_send_to_plugin({ ir: testIR })
        → monorail_get_plugin_logs()
        → "Error in timeline rendering, line 245..."
        → Fixes code
        → Retries immediately
```

The plugin development itself becomes a collaboration loop — which is exactly what Monorail is about.

### 3. Enables "Claude-Assisted Everything"

The broader insight: Monorail isn't "tools Claude can use" — it's a **collaboration relationship**. Claude helps with:
- Setup and troubleshooting
- Testing the workflow works
- The actual deck creation
- Debugging when things break

WebSocket is foundational to this model.

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User's Machine                       │
│                                                              │
│  ┌──────────────┐         WebSocket          ┌────────────┐ │
│  │  MCP Server  │◄─────────────────────────►│   Figma    │ │
│  │  (monorail)  │        localhost:XXXX      │   Plugin   │ │
│  └──────┬───────┘                            └────────────┘ │
│         │                                                    │
│         │ stdio                                              │
│         │                                                    │
│  ┌──────▼───────┐                                           │
│  │    Claude    │                                           │
│  │   (Cursor)   │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

**Flow:**
1. MCP server starts WebSocket server on localhost (e.g., port 9876)
2. User opens Figma plugin
3. Plugin connects to `ws://localhost:9876`
4. MCP server knows plugin is connected
5. Claude can now use tools that interact with plugin

---

## Proposed MCP Tools

### `monorail_connection_status`
Check if Figma plugin is connected.

```typescript
// Returns
{ connected: boolean, pluginVersion?: string, documentName?: string }
```

### `monorail_push_ir`
Send IR directly to connected plugin for Apply.

```typescript
// Input
{ ir: DeckIR, action: "apply" | "preview" }
// Returns
{ success: boolean, slidesCreated: number, slidesUpdated: number, errors?: string[] }
```

### `monorail_pull_ir`
Request current deck state from plugin (Export).

```typescript
// Returns
{ ir: DeckIR, slideCount: number }
```

### `monorail_get_plugin_logs`
Retrieve recent console output from plugin (for debugging).

```typescript
// Input
{ lines?: number }  // default 50
// Returns
{ logs: string[] }
```

### `monorail_test_workflow`
Run a test cycle to confirm everything works.

```typescript
// Creates test deck → applies → exports → compares
// Returns
{ success: boolean, details: string }
```

---

## Research Questions (Answered ✅)

### 1. Can Figma plugins open WebSocket connections?

**Answer: YES ✅**
- Figma plugin UI runs in iframe with full browser APIs
- WebSocket to `ws://localhost:9876` works perfectly
- No CORS issues for localhost
- Persistent connection with auto-reconnect

### 2. Message Protocol

**Decision: Simple JSON**
```json
{ "type": "push-ir", "payload": { "ir": {...}, "autoApply": true } }
{ "type": "applied", "payload": { "success": true, "slideCount": 8 } }
```

### 3. Connection Lifecycle

**Implemented:**
- Plugin connects on open (auto-connect)
- Shows green/yellow/red status indicator
- Reconnects automatically if server restarts
- Server tracks connected plugin info

### 4. Security

**Decision: Localhost-only, no auth**
- Risk of other local processes connecting is acceptable
- Adding shared secrets would complicate setup with minimal benefit

### 5. MCP Server Changes

**Implemented in `src/index.ts`:**
- WebSocket server starts alongside stdio transport
- Listens on port 9876
- Tracks connected plugins
- Routes tool calls to plugin via WebSocket

---

## Implementation Plan (Complete ✅)

### Phase 1: Research & Spike ✅
- [x] Verify Figma plugin can open WebSocket
- [x] Simple spike: plugin sends "hello", server responds
- [x] Document gotchas (see `docs/failures.md`)

### Phase 2: Basic Bridge ✅
- [x] MCP server hosts WebSocket on startup
- [x] Plugin connects on open
- [x] `monorail_connection_status` tool works
- [x] `monorail_push_ir` sends IR, plugin applies
- [x] `monorail_pull_ir` requests export

### Phase 3: Developer Tools (Deferred)
- [ ] Plugin sends console logs to server
- [ ] `monorail_get_plugin_logs` tool
- [ ] `monorail_test_workflow` for validation

### Phase 4: Polish ✅
- [x] Reconnection handling
- [x] Error messages in plugin UI
- [x] Activity feed shows recent messages
- [x] Manual controls collapsed (WebSocket is primary)

---

## Sync Model: Explicit, Not Automatic

**Decision:** Hybrid model with explicit triggers (Option D)

| Actor | Action | Mechanism |
|-------|--------|-----------|
| Claude | Push IR to plugin | `monorail_push_ir` MCP tool |
| Claude | Pull IR from plugin | `monorail_pull_ir` MCP tool |
| Human | Push to Claude | Plugin button (via WebSocket) |
| Human | Pull from Claude | Plugin button (via WebSocket) |

**Why not automatic/streaming?**
- Adds complexity (debouncing, race conditions)
- "Which version is canonical?" becomes ambiguous
- Explicit sync keeps human and Claude in control of their own timing

**The win:** One-click replaces copy/paste. That's enough friction reduction for v1.

**Future possibility:** Could add opt-in auto-sync later if the explicit model feels clunky in practice.

---

## Relationship to Other Work

- **Freeform handling**: Done, WebSocket will use the same IR format with `extras`
- **Visual feedback**: Could extend WebSocket to send screenshots (future)
- **Collaboration model**: WebSocket is foundational to the "Claude helps with everything" vision

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Auto-start or opt-in? | Auto-start with MCP |
| What port? | Fixed 9876 |
| Multiple documents? | One plugin connection at a time (last wins) |
| Multiple MCP processes? | Can cause conflicts — only one binds port (see `failures.md`) |

## Known Issues

- **Multiple MCP processes:** If multiple monorail-mcp processes run (e.g., manual + Cursor), only one binds port 9876. Plugin may connect to wrong one. Fix: `ps aux | grep monorail` and kill the rogue process.
