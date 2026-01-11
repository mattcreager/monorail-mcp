# Monorail 🚝

> *"I've sold monorails to Brockway, Ogdenville, and North Haverbrook—and by gum, it put them on the map!"*

An MCP server that gives Claude the power to build presentation decks with you in Figma Slides. Not generate and export—actually collaborate.

**v0 is complete. The loop works. 🎉**

## The Problem

Most AI deck tools generate slides, not arguments. The output looks professional, but when you present... something's missing. The audience nods politely, then asks "so what's the ask?"

**The deck had information. It didn't have an argument.**

## The Solution

Monorail treats a deck as an argument with a shape. Claude and you work in Figma together:

```
Claude                              Figma Plugin
   │                                      │
   ├──── monorail_push_ir ───────────────►│ (auto-applies)
   │                                      │
   │◄──── monorail_pull_ir ───────────────┤ (exports & returns IR)
   │                                      │
   │                                Human edits in Figma
   └──────────── repeat ──────────────────┘
```

Not a one-way export. A collaboration loop. **No copy/paste required.**

## Quick Start

### 1. Add to Cursor MCP config

Add to `~/.cursor/mcp.json`:

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

### 2. Build the plugin

```bash
cd figma-plugin && npm install && npm run build
```

### 3. Load in Figma Slides

Figma → Plugins → Development → Import plugin from manifest → select `figma-plugin/manifest.json`

### 4. Connect and collaborate

1. Open a Figma Slides document
2. Run the Monorail plugin (it auto-connects via WebSocket)
3. Use Claude: `monorail_pull_ir` to get current deck, `monorail_push_ir` to send updates

## How It Works

1. **You brief Claude** — What's the deck about? Who's in the room? What's the ask?
2. **Claude finds the spine** — Setup → Turn → Landing. The core argument.
3. **Claude generates slides** — Using constrained archetypes that force clarity.
4. **You see it in Figma** — React, spike ideas, move things around.
5. **Claude pulls your changes** — Via `monorail_pull_ir`. Sees your edits.
6. **Claude adapts** — Via `monorail_push_ir`. Updates slides in place.
7. **Loop until it lands** — Some slides get locked. Others stay in flux.

## The Narrative Toolkit

- **Spine**: Every deck needs one. Setup → Turn → Landing.
- **Hallway Test**: If someone walks out, what one sentence do they say?
- **Deletion Test**: Can you cut this slide without breaking the argument? If yes, it's filler.
- **Archetypes**: 10 constrained templates. Word limits force clarity.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design and components
- [Plugin Spec](docs/PLUGIN-SPEC.md) — IR format and Figma integration
- [Narrative Skill](docs/SKILL.md) — The thinking toolkit for Claude
- [Archetypes](docs/references/archetypes.md) — Slide template specs
- [Critics](docs/references/critics.md) — QA heuristics

## Development

```bash
# MCP server
npm install
npm run build        # Build once
npm run dev          # Watch mode

# Figma plugin
cd figma-plugin
npm install
npm run build        # Build once
npm run watch        # Watch mode
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `monorail_connection_status` | Check if plugin is connected |
| `monorail_push_ir` | Send IR to plugin (auto-apply) |
| `monorail_pull_ir` | Request export, returns IR |
| `monorail_create_deck` | Create deck from IR (in-memory) |
| `monorail_preview` | Generate HTML preview |

## Project Structure

```
monorail-mcp/
├── src/index.ts          # MCP server (WebSocket + tools)
├── figma-plugin/         # Figma plugin
│   ├── code.ts           # Plugin logic (Apply + Export)
│   ├── ui.html           # Plugin UI (WebSocket client)
│   └── manifest.json
├── docs/                 # Design documentation
│   ├── ARCHITECTURE.md
│   ├── PLUGIN-SPEC.md
│   ├── SKILL.md
│   ├── HANDOFF.md        # Start here
│   ├── failures.md       # Learnings log
│   ├── decisions/        # Architectural decisions
│   └── references/
├── examples/             # Demo decks
└── PLAN.md               # Project plan (read for current state)
```

## Status

**v0 — Complete! ✅**

- [x] Architecture spec
- [x] Narrative toolkit
- [x] IR format spec
- [x] MCP server (with WebSocket)
- [x] Figma plugin (Apply + Export)
- [x] WebSocket bridge (no copy/paste!)
- [x] All 10 archetypes
- [x] Freeform edit handling (extras capture)
- [x] Update-in-place (preserves formatting)

**v1 — Next up:**
- [ ] Delete slide capability
- [ ] IR validation
- [ ] Figma Slides best practices (Auto Layout, Components)
- [ ] Visual feedback (Claude seeing rendered output)

## License

MIT

---

*Named after The Simpsons' "Marge vs. the Monorail"—a masterclass in narrative structure. The argument lands so hard it sells Springfield a disaster. The irony is intentional.*
