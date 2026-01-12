# Monorail: Team Onboarding Guide

> **Start here if you're new to Monorail.**

---

## What Is Monorail?

**Monorail** is an MCP server that lets Claude and humans collaborate on presentation decks in Figma Slides — in real-time, on the same canvas.

Not "generate and export." An actual **collaboration loop**:

```
You edit in Figma  →  Claude sees it via monorail_pull
Claude pushes changes  →  You see them instantly in Figma
```

**Named after** The Simpsons' "Marge vs. the Monorail" — Lyle Lanley's pitch is a masterclass in narrative structure. The argument lands so hard it sells Springfield a monorail (which turns out to be a disaster, but the pitch was flawless).

---

## 5-Minute Setup

### Prerequisites

- Node.js 18+ (`node --version` to check)
- Cursor IDE with Claude
- Figma account with Slides access

### Install

```bash
# 1. Clone and build
git clone <repo-url>
cd monorail-mcp
npm install && npm run build
cd figma-plugin && npm install && npm run build && cd ..

# 2. Add to Cursor MCP config (~/.cursor/mcp.json)
{
  "mcpServers": {
    "monorail": {
      "command": "node",
      "args": ["/full/path/to/monorail-mcp/dist/index.js"]
    }
  }
}

# 3. Restart Cursor

# 4. In Figma: Plugins → Development → Import plugin from manifest
#    Select: monorail-mcp/figma-plugin/manifest.json
```

### Verify It Works

1. Open a Figma Slides document
2. Run Monorail plugin (Plugins → Development → Monorail)
3. Should see green "Connected" in plugin UI
4. In Cursor, ask Claude: "Check monorail status" — should confirm connection

---

## Quick Workflow Demo

**Creating a deck from scratch:**

```
You: "I need a 10-slide deck for the Q1 board meeting. 
      Audience is the exec team. Ask is budget approval for Project X."

Claude: [uses monorail_push to create slides in Figma]

You: [see slides appear in Figma, move some around, tweak text]

You: "Slide 4 feels weak. Can you make it punchier?"

Claude: [uses monorail_pull to see your changes, then monorail_patch to update]

You: "Perfect. Lock slides 1-5, keep iterating on 6-10."

[...loop continues until the deck lands...]
```

**Editing an existing deck:**

```
You: "Pull the current deck and tell me what you see"

Claude: [uses monorail_pull to analyze the deck structure]

Claude: "I see 8 slides. The narrative arc goes... 
         Slide 3 seems to repeat slide 2's point. 
         Slide 6 is doing too much. Want me to suggest changes?"
```

---

## The 9 Tools

| Tool | What It Does |
|------|--------------|
| `monorail_status` | Check WebSocket connection to Figma |
| `monorail_pull` | Read current deck state (slides, text, Figma IDs) |
| `monorail_push` | Create/replace slides from IR specification |
| `monorail_patch` | Update specific text by Figma node ID |
| `monorail_capture` | Get full structure of a slide (for cloning) |
| `monorail_clone` | Clone a slide with new content |
| `monorail_delete` | Delete slides by ID |
| `monorail_reorder` | Reorder slides |
| `monorail_screenshot` | Export slide as PNG (AI visual QA) |

---

## Key Concepts

### IR (Intermediate Representation)

The JSON format Claude uses to describe slides:

```json
{
  "deck": { "title": "Q1 Board Deck" },
  "slides": [
    {
      "id": "slide-1",
      "archetype": "title",
      "content": {
        "headline": "Project X: The Path Forward",
        "subline": "Q1 2026 Budget Request"
      }
    }
  ]
}
```

### Archetypes

11 constrained slide templates. Constraints force clarity:

- `title` — Opening slides (headline ≤8 words)
- `bullets` — Supporting points (3 bullets max)
- `big-idea` — Key insights, the "turn"
- `quote` — Testimonials
- `two-column` — Comparisons
- etc.

### The Narrative Toolkit

Claude uses narrative thinking:

- **Spine**: Setup → Turn → Landing
- **Hallway Test**: What one sentence does the audience walk away with?
- **Deletion Test**: Can you cut this slide without breaking the argument?

---

## Common Issues

### "No plugin connected"

Multiple MCP processes may be running. Kill extras:

```bash
ps aux | grep monorail
kill <PID>  # Kill the one that's NOT Cursor's
```

### Plugin shows disconnected

1. Make sure Cursor is running (it hosts the MCP server)
2. Restart Cursor after changing `mcp.json`
3. Re-run the plugin in Figma

### Changes not appearing

- Check `monorail_status` first
- Try `monorail_push` with `mode: "replace"` to force recreate
- Look for error messages in Cursor's Claude response

---

## Files You'll Care About

| File | Purpose |
|------|---------|
| `README.md` | Full documentation |
| `PLAN.md` | Current project state, session logs |
| `docs/SKILL.md` | The narrative thinking toolkit |
| `docs/references/mcp-tools.md` | Detailed tool docs |
| `docs/failures.md` | Learnings and gotchas |

---

## Development

```bash
# MCP server (in root)
npm run dev       # Watch mode

# Figma plugin (in figma-plugin/)
npm run watch     # Watch mode — hot reloads in Figma!
```

---

## Current Status

**v0 complete** — full collaboration loop working:

- ✅ WebSocket bridge (no copy/paste)
- ✅ All 11 archetypes with Auto Layout
- ✅ Visual diagrams (cycle diagram)
- ✅ Screenshot export (AI can "see" the deck)
- ✅ Table extraction

**In progress:**

- More diagram types
- Shape round-tripping
- Better error messages

---

## Questions?

- Check `docs/failures.md` for known issues
- Read `PLAN.md` for project history and context
- Ask in the team channel
