# Monorail 🚝

> *"I've sold monorails to Brockway, Ogdenville, and North Haverbrook—and by gum, it put them on the map!"*

An MCP server that gives Claude the power to build presentation decks **with you** in Figma Slides. Not generate-and-export—actually collaborate in real-time.

---

## ✨ What Makes This Different

Most AI deck tools generate slides, not arguments. The output looks professional, but when you present... something's missing. The audience nods politely, then asks "so what's the ask?"

**The deck had information. It didn't have an argument.**

Monorail treats a deck as an argument with a shape. Claude and you work in the same Figma canvas:

```
You: "Make slide 4 punchier"     →  Claude updates it live in Figma
You: Move slides around in Figma →  Claude sees your changes, adapts
You: "Lock slides 1-3"           →  Claude focuses on the rest
```

**No copy/paste. No export/import. One shared canvas.**

---

## 🚀 Quick Start (5 minutes)

### Prerequisites

- **Node.js 18+** — Check with `node --version`
- **Cursor IDE** with Claude — [cursor.com](https://cursor.com)
- **Figma account** with Slides access — [figma.com/slides](https://figma.com/slides)

### Step 1: Clone and Build

```bash
# Clone the repo
git clone https://github.com/your-org/monorail-mcp.git
cd monorail-mcp

# Install and build MCP server
npm install
npm run build

# Install and build Figma plugin
cd figma-plugin
npm install
npm run build
cd ..
```

### Step 2: Configure Cursor MCP

Add Monorail to your Cursor MCP config. Open (or create) `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "monorail": {
      "command": "node",
      "args": ["/full/path/to/monorail-mcp/dist/index.js"]
    }
  }
}
```

> ⚠️ **Use the full absolute path** — e.g., `/Users/yourname/Code/monorail-mcp/dist/index.js`

Then **restart Cursor** to load the MCP server.

### Step 3: Load the Figma Plugin

1. Open **Figma** (desktop app or browser)
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `monorail-mcp/figma-plugin/manifest.json`

This is a one-time setup. The plugin will appear in your Plugins menu.

### Step 4: Connect and Collaborate

1. Open or create a **Figma Slides** document
2. Run the Monorail plugin: **Plugins** → **Development** → **Monorail**
3. You should see a green **"Connected"** indicator in the plugin UI
4. In Cursor, try: `monorail_status` — should confirm connection

**You're ready!** 🎉

---

## 📖 How It Works

### The Collaboration Loop

```
Claude                                Figma Plugin
  │                                        │
  │  monorail_push                         │
  ├───────────────────────────────────────►│  Creates slides from IR
  │                                        │
  │  monorail_pull                         │
  │◄───────────────────────────────────────┤  Returns deck state + IDs
  │                                        │
  │                              Human edits in Figma
  │                                        │
  │  monorail_patch                        │
  ├───────────────────────────────────────►│  Surgical text updates
  │                                        │
  │  monorail_screenshot                   │
  ├───────────────────────────────────────►│  Visual QA (AI "sees" it)
  │                                        │
  └────────────── repeat ──────────────────┘
```

### Typical Workflow

1. **Brief Claude** — "I need a deck for the Q1 review. Audience is the exec team. Ask is budget approval."
2. **Claude proposes a spine** — Setup → Turn → Landing. The core argument structure.
3. **Claude generates slides** — `monorail_push` creates them in Figma
4. **You react in Figma** — Move things, tweak text, add your own slides
5. **Claude pulls your changes** — `monorail_pull` shows Claude what you did
6. **Claude adapts** — Updates via `monorail_patch`, preserving your formatting
7. **Iterate until it lands** — Some slides get locked, others stay in flux

---

## 🛠 MCP Tools Reference

Monorail provides **9 tools** for Claude to collaborate on decks:

| Tool | Purpose |
|------|---------|
| `monorail_status` | Check if Figma plugin is connected |
| `monorail_pull` | Get deck state from Figma (slides, elements, Figma node IDs) |
| `monorail_push` | Create/replace slides from IR (with validation, optional positioning) |
| `monorail_patch` | Update specific text elements by Figma node ID |
| `monorail_capture` | Full node tree + design system + editable slots |
| `monorail_clone` | Clone a slide + update its content (preserves styling) |
| `monorail_delete` | Delete slides by Figma node ID |
| `monorail_reorder` | Reorder slides to match specified order |
| `monorail_screenshot` | Export slide as PNG — gives AI "eyes" to see rendered output |

See [docs/references/mcp-tools.md](docs/references/mcp-tools.md) for detailed documentation.

---

## 🎨 Visual Diagrams

Monorail can render **native Figma diagrams**, not just text. Add a `visual` field to any slide:

```json
{
  "archetype": "big-idea",
  "content": {
    "headline": "The Flywheel",
    "subline": "Each cycle makes the next one faster",
    "visual": {
      "type": "cycle",
      "nodes": ["Show up", "Learn", "Iterate", "Compound", "Gravity"],
      "colors": ["cyan", "green", "orange", "pink", "purple"],
      "position": "right"
    }
  }
}
```

Renders as **native Figma shapes** — editable circles, curved arrows, styled text. Not an image.

---

## 🎯 Slide Archetypes (11 total)

| Archetype | Purpose | Key Constraints |
|-----------|---------|-----------------|
| `title` | Opening, sections | Headline ≤8 words |
| `section` | Divider | Phrase ≤5 words |
| `big-idea` | Key insight, the turn | Headline ≤12, subline ≤20 |
| `bullets` | Supporting points | 3 bullets max, ≤10 words each |
| `two-column` | Comparison, text+visual | 2 content blocks |
| `quote` | Testimonial | Quote ≤30 words + attribution |
| `chart` | Data evidence | Headline + chart placeholder + takeaway |
| `timeline` | Process, roadmap | 3-5 stages |
| `comparison` | Options, before/after | 2-4 cols, 3-5 rows |
| `summary` | Closing, next steps | 3 items max |
| `position-cards` | 3-column cards with badges | Complex layout for positioning |
| `video` | Video embed placeholder | Headline + video URL + caption |

See [docs/references/archetypes.md](docs/references/archetypes.md) for full specifications.

---

## 🔧 Troubleshooting

### "No plugin connected" but plugin shows green

**Cause:** Multiple MCP processes running. Only one can bind port 9876.

**Fix:**
```bash
# Find rogue processes
ps aux | grep monorail

# Kill the extra one (not Cursor's)
kill <PID>

# Cursor will restart its MCP process automatically
```

### Plugin won't connect

1. Make sure Cursor is running (it hosts the MCP server)
2. Check that `~/.cursor/mcp.json` has the correct path
3. Restart Cursor after config changes
4. Re-run the Monorail plugin in Figma

### Slides look wrong / text overlapping

The plugin uses Auto Layout containers. If you see overlap:
- Check that you're using a supported archetype
- Try `monorail_push` with `mode: "replace"` to recreate

### Font substitution warnings

Monorail tries fonts in order: Supply → Inter → SF Pro → Helvetica → Arial. If your system is missing fonts, it falls back gracefully but may look different.

### WebSocket port conflict

Monorail uses port **9876**. If another app uses this port:
```bash
lsof -i :9876  # See what's using it
```

---

## 🏗 Development

### MCP Server

```bash
npm install
npm run build        # Build once
npm run dev          # Watch mode (rebuilds on change)
npm run start        # Run the server directly
```

### Figma Plugin

```bash
cd figma-plugin
npm install
npm run build        # Build once
npm run watch        # Watch mode (hot reloads in Figma!)
```

> 💡 **Hot reload:** When you save changes, Figma automatically reloads the plugin. No need to close/reopen.

### Project Structure

```
monorail-mcp/
├── src/index.ts              # MCP server (WebSocket + 9 tools)
├── shared/types.ts           # Shared TypeScript types
├── figma-plugin/
│   ├── code.ts               # Plugin logic
│   ├── ui.html               # Plugin UI (WebSocket client)
│   ├── manifest.json         # Figma plugin manifest
│   └── src/                  # Extracted modules (WIP)
├── docs/
│   ├── ARCHITECTURE.md       # System design
│   ├── SKILL.md              # Narrative toolkit for Claude
│   ├── PLUGIN-SPEC.md        # IR format specification
│   ├── HANDOFF.md            # Quick context for new devs
│   ├── failures.md           # Learnings log (gotchas, API quirks)
│   ├── decisions/            # Architecture Decision Records
│   └── references/           # Detailed docs (archetypes, tools, etc.)
├── examples/                 # Demo decks and test briefs
└── PLAN.md                   # Project roadmap and session logs
```

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and component overview |
| [SKILL.md](docs/SKILL.md) | The narrative thinking toolkit |
| [PLUGIN-SPEC.md](docs/PLUGIN-SPEC.md) | IR format for slides |
| [HANDOFF.md](docs/HANDOFF.md) | Quick start for new developers |
| [mcp-tools.md](docs/references/mcp-tools.md) | Full tool documentation |
| [archetypes.md](docs/references/archetypes.md) | Slide template specs |
| [failures.md](docs/failures.md) | Learnings and gotchas |

---

## ✅ Status

**v0 complete — full collaboration loop working!**

- [x] WebSocket bridge — live sync, no copy/paste
- [x] Rich export — all elements with Figma node IDs
- [x] Targeted patches — update specific elements, preserve layouts
- [x] Template capture + clone — design in Figma, clone with new content
- [x] Auto Layout for all 11 archetypes
- [x] Visual diagrams — native Figma rendering (cycle diagram)
- [x] Slide operations — delete, reorder, insert at position
- [x] Screenshot export — AI can "see" what was rendered
- [x] Table extraction — read tables from Figma Slides

**Known limitations:**
- Shape round-tripping — manual diagram edits may be lost on re-push
- Table write — can read tables, but can't create/update yet
- Limited diagram types — only cycle for now (funnel, timeline coming)

---

## 🤝 Contributing

1. Read [PLAN.md](PLAN.md) for current priorities
2. Check [docs/failures.md](docs/failures.md) for known gotchas
3. Follow the "Ralph Wiggum" methodology: one focused task per session, log learnings

---

## 📄 License

MIT

---

*Named after The Simpsons' "Marge vs. the Monorail"—a masterclass in narrative structure. The argument lands so hard it sells Springfield a disaster. The irony is intentional: we're building a tool to make pitches land, named after a pitch that landed too well.*
