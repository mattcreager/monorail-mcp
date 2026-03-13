# Monorail

MCP server for real-time design collaboration in Figma. Claude and humans work in the same canvas — no export/import, no copy/paste.

> "I've sold monorails to Brockway, Ogdenville, and North Haverbrook — and by gum, it put them on the map!"

## Installation

### Prerequisites

- Node.js 18+ (`node --version`)
- An MCP client (Claude Code, Claude Desktop, Cursor, etc.)
- Figma account with Slides access

### Build

```bash
git clone https://github.com/anthropics/monorail-mcp.git
cd monorail-mcp
npm install && npm run build

cd figma-plugin
npm install && npm run build
cd ..
```

### Configure your MCP client

Add Monorail to your MCP client config. For Claude Desktop, edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "monorail": {
      "command": "node",
      "args": ["/full/path/to/monorail-mcp/dist/src/index.js"]
    }
  }
}
```

> Use the full absolute path. Restart your MCP client after adding the config.

### Load the Figma Plugin

1. Open Figma (desktop app or browser)
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `monorail-mcp/figma-plugin/manifest.json`

This is a one-time setup.

### Verify

1. Open a Figma Slides document
2. Run the plugin: **Plugins > Development > Monorail**
3. Check for the green "Connected" indicator
4. In your MCP client, run `monorail_status` to confirm

## Quick Start

```
# Create a deck from a brief
You: "Build a 6-slide deck for the Q1 review. Audience is the exec team."
Claude: [monorail_push — slides appear in Figma]

# Edit in Figma, then sync
You: [move slides around, tweak text directly in Figma]
Claude: [monorail_pull — sees your changes]

# Surgical updates
Claude: [monorail_patch — updates specific text, preserves your formatting]

# Visual QA
Claude: [monorail_screenshot — sees the rendered result, iterates]
```

The core loop: **push > pull > patch > screenshot > repeat**.

## Tools

Monorail provides 14 tools organized into five categories.

### Connection

| Tool | Description |
|------|-------------|
| `monorail_status` | Check if the Figma plugin is connected via WebSocket |

### Deck Operations

The core collaboration loop. Push slides, pull state, patch elements.

| Tool | Description |
|------|-------------|
| `monorail_pull` | Get deck state from Figma (full, summary, or single slide) |
| `monorail_push` | Create or replace slides from IR specification |
| `monorail_patch` | Edit, add, or delete elements by Figma node ID |
| `monorail_clone` | Clone a slide and update text content (preserves styling) |

### Visual

Inspect, export, and create visual content.

| Tool | Description |
|------|-------------|
| `monorail_screenshot` | Export a slide as PNG (gives AI "eyes" to see renders) |
| `monorail_export` | Export any node as SVG or PNG (vectors, components, icons) |
| `monorail_css` | Extract CSS and raw paint data from a node |
| `monorail_primitives` | Low-level design: frames, text, shapes, paths, arrows, gradients |

### Discovery

Explore the Figma document structure.

| Tool | Description |
|------|-------------|
| `monorail_find` | Search for nodes by type and/or name |
| `monorail_component` | Get component info, variant properties, siblings |
| `monorail_capture` | Full node tree with design system tokens and template slots |

### Deck Management

| Tool | Description |
|------|-------------|
| `monorail_delete` | Delete slides by Figma node ID |
| `monorail_reorder` | Reorder slides to match a specified order |

See [docs/references/mcp-tools.md](docs/references/mcp-tools.md) for parameters, examples, and workflow patterns.

## Slide Archetypes

Constrained slide templates. Constraints force clarity — if content doesn't fit, edit the content.

| Archetype | Purpose | Key Constraints |
|-----------|---------|-----------------|
| `title` | Opening, sections | Headline ≤8 words |
| `section` | Divider | Phrase ≤5 words |
| `big-idea` | Key insight, the turn | Headline ≤12, subline ≤20 |
| `bullets` | Supporting points | 3 bullets max, ≤10 words each |
| `two-column` | Comparison, text+visual | 2 content blocks |
| `quote` | Testimonial | Quote ≤30 words + attribution |
| `chart` | Data evidence | Headline + chart + takeaway |
| `timeline` | Process, roadmap | 3-5 stages |
| `comparison` | Options, before/after | 2-4 cols, 3-5 rows |
| `summary` | Closing, next steps | 3 items max |
| `position-cards` | 3-column cards with badges | Complex layout |
| `video` | Video embed placeholder | Headline + URL + caption |

See [docs/references/archetypes.md](docs/references/archetypes.md) for full specifications.

## Workflow Patterns

**Edit existing content** (most common):
```
monorail_pull → monorail_patch → repeat
```

**Bootstrap a new deck**:
```
monorail_push (IR) → monorail_pull (get IDs) → monorail_patch (refine)
```

**Clone with variations**:
```
monorail_capture (structure + slots) → monorail_clone (new content)
```

**Visual QA**:
```
monorail_push → monorail_screenshot → iterate
```

**Design-to-code extraction**:
```
monorail_find → monorail_css → monorail_export (SVG)
```

**Custom slide layout** (no archetypes):
```
monorail_primitives (frames, text, shapes, gradients)
```

**Component exploration**:
```
monorail_find (type: COMPONENT) → monorail_component (variants)
```

## How It Works

```
Claude (MCP client)                  Figma Plugin
  │                                       │
  │  monorail_push                        │
  ├──────────────────────────────────────►│  Creates slides from IR
  │        (WebSocket on port 9876)       │
  │                                       │
  │                             Human edits in Figma
  │                                       │
  │  monorail_pull                        │
  │◄──────────────────────────────────────┤  Returns deck state + IDs
  │                                       │
  │  monorail_patch                       │
  ├──────────────────────────────────────►│  Surgical element updates
  │                                       │
  │  monorail_screenshot                  │
  ├──────────────────────────────────────►│  Visual QA (AI "sees" it)
  │                                       │
  └───────────── repeat ──────────────────┘
```

The MCP server communicates with Claude over stdio and with the Figma plugin over WebSocket. Both parties work in the same Figma document — Claude proposes, human edits, Claude sees changes and adapts.

## Development

### MCP Server

```bash
npm install
npm run build        # Build once
npm run dev          # Watch mode
npm run start        # Run directly
```

### Figma Plugin

```bash
cd figma-plugin
npm install
npm run build        # Build once
npm run watch        # Watch mode (hot reloads in Figma)
```

### Project Structure

```
monorail-mcp/
├── src/index.ts              # MCP server (WebSocket + 14 tools)
├── shared/types.ts           # Shared TypeScript types
├── figma-plugin/
│   ├── code.ts               # Plugin logic (Figma API calls)
│   ├── ui.html               # Plugin UI (WebSocket client)
│   ├── manifest.json         # Figma plugin manifest
│   └── src/                  # Extracted modules
├── docs/
│   ├── ARCHITECTURE.md       # System design
│   ├── SKILL.md              # Narrative thinking toolkit
│   ├── PLUGIN-SPEC.md        # IR format specification
│   ├── HANDOFF.md            # Team onboarding guide
│   ├── failures.md           # Learnings log (API quirks, gotchas)
│   ├── decisions/            # Architecture Decision Records
│   ├── references/           # Tool docs, archetypes, design system
│   └── discovery/            # Research and exploration notes
├── examples/                 # Demo decks and test briefs
└── PLAN.md                   # Project roadmap and session logs
```

## Documentation

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and component overview |
| [SKILL.md](docs/SKILL.md) | Narrative thinking toolkit for Claude |
| [PLUGIN-SPEC.md](docs/PLUGIN-SPEC.md) | IR format for slides |
| [HANDOFF.md](docs/HANDOFF.md) | Team onboarding guide |
| [mcp-tools.md](docs/references/mcp-tools.md) | Full tool reference with parameters and examples |
| [archetypes.md](docs/references/archetypes.md) | Slide template specifications |
| [failures.md](docs/failures.md) | Learnings and gotchas |

## Troubleshooting

### "No plugin connected" but plugin shows green

Multiple MCP processes may be running — only one can bind port 9876.

```bash
ps aux | grep monorail    # Find rogue processes
kill <PID>                # Kill the extra one
```

Your MCP client will restart its process automatically.

### Plugin won't connect

1. Make sure your MCP client is running (it hosts the MCP server)
2. Check that the MCP config has the correct absolute path
3. Restart the client after config changes
4. Re-run the Monorail plugin in Figma

### Slides look wrong or text overlapping

The plugin uses Auto Layout containers. If you see overlap:
- Check that you're using a supported archetype
- Try `monorail_push` with `mode: "replace"` to recreate

### Font substitution

Monorail tries fonts in order: Supply > Inter > SF Pro > Helvetica > Arial. Missing fonts fall back gracefully but may look different.

### WebSocket port conflict

Monorail uses port 9876.

```bash
lsof -i :9876    # See what's using it
```

## License

MIT. See [LICENSE](LICENSE).

---

*Named after The Simpsons' "Marge vs. the Monorail" — Lyle Lanley's pitch is a masterclass in narrative structure. The argument lands so hard it sells Springfield a monorail. The irony is intentional: we build a tool to make pitches land, named after a pitch that landed too well.*
