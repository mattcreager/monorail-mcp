# Monorail 🚝

> *"I've sold monorails to Brockway, Ogdenville, and North Haverbrook—and by gum, it put them on the map!"*

An MCP server that gives Claude the power to build presentation decks with you in Figma. Not generate and export—actually collaborate.

## The Problem

Most AI deck tools generate slides, not arguments. The output looks professional, but when you present... something's missing. The audience nods politely, then asks "so what's the ask?"

**The deck had information. It didn't have an argument.**

## The Solution

Monorail treats a deck as an argument with a shape. Claude and you work in Figma together:

```
Claude writes → FIGMA SLIDES ← You edit
                    ↓
         Claude reads via MCP, sees changes, adapts
```

Not a one-way export. A collaboration loop.

## Installation

```bash
# Add to your Claude MCP config
npx monorail-mcp init
```

## How It Works

1. **You brief Claude** — What's the deck about? Who's in the room? What's the ask?
2. **Claude finds the spine** — Setup → Turn → Landing. The core argument.
3. **Claude generates slides** — Using constrained archetypes that force clarity.
4. **You see it in Figma** — React, spike ideas, move things around.
5. **Claude sees your changes** — Via MCP. Adapts. Iterates.
6. **Loop until it lands** — Some slides get locked. Others stay in flux.

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
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev
```

## Project Structure

```
monorail-mcp/
├── src/                  # MCP server source
│   ├── index.ts          # Entry point
│   └── tools/            # Tool implementations
├── docs/                 # Design documentation
│   ├── ARCHITECTURE.md
│   ├── PLUGIN-SPEC.md
│   ├── SKILL.md
│   └── references/
├── examples/             # Demo decks and test briefs
└── dist/                 # Compiled output
```

## Status

**v0 — Under Construction**

- [x] Architecture spec
- [x] Narrative toolkit
- [x] IR format spec
- [ ] MCP server implementation
- [ ] Figma read integration
- [ ] Figma write integration
- [ ] Archetype component library

## License

MIT

---

*Named after The Simpsons' "Marge vs. the Monorail"—a masterclass in narrative structure. The argument lands so hard it sells Springfield a disaster. The irony is intentional.*
