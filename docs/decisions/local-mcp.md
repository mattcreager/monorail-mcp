# Decision: Local MCP Server (Not Remote)

**Date:** 2026-01-11  
**Status:** Decided  
**Context:** Considering whether monorail-mcp should run locally or as a remote hosted service

---

## Decision

**Run monorail-mcp locally on the user's machine.**

The MCP server runs as a local process, started by Cursor, with a WebSocket server on localhost for Figma plugin communication.

---

## Architecture

```
User's Machine
┌─────────────────────────────────────────────┐
│  Cursor (Claude) ←──stdio──→ MCP Server     │
│                                   │         │
│                              WebSocket      │
│                               :9876         │
│                                   │         │
│  Figma Plugin ←──────────────────┘         │
└─────────────────────────────────────────────┘
```

Everything stays local. No remote servers involved.

---

## Rationale

| Factor | Local MCP | Remote MCP |
|--------|-----------|------------|
| **Latency** | Instant (localhost) | Network round-trip per push/pull |
| **Privacy** | Deck content stays on machine | Goes through external server |
| **Auth** | None needed (localhost = trusted) | Need API keys, OAuth, etc. |
| **Offline** | Works | Doesn't |
| **Cost** | Free | Server hosting required |
| **Complexity** | Just works | Deploy, maintain, secure |

### Key Insight

The collaboration is between **one human + one Claude instance**, both running locally in Cursor. There's no multi-user or multi-device scenario that would benefit from a remote server.

### Privacy Matters

Presentation decks often contain:
- Confidential business information
- Unreleased product details
- Financial data
- Strategic plans

Keeping everything local means this content never leaves the user's machine (except through Claude's normal conversation, which the user controls).

---

## When Remote Would Matter

A remote architecture would make sense for:

1. **Scheduled/autonomous updates** — Claude updating decks while user is away
2. **Multi-device access** — Start on laptop, continue on desktop
3. **Web UI** — Browser-based interface instead of Cursor
4. **Team collaboration** — Multiple humans/agents on same deck

These are different products. For the core use case ("Claude + human iterating on a deck together"), local is correct.

---

## Installation

Users add monorail to their Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "monorail": {
      "command": "node",
      "args": ["/path/to/monorail-mcp/dist/index.js"]
    }
  }
}
```

Cursor handles starting/stopping the server automatically.

---

## Future Considerations

If we later need remote capabilities (e.g., webhook-triggered updates), we could:

1. Add a separate "monorail-agent" service that calls MCP tools
2. Keep the Figma WebSocket bridge local (plugin always connects to localhost)
3. Remote service communicates with local MCP via some bridge

But this complexity isn't needed for v1.
