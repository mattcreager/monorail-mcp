# Monorail: Project Plan

> Living document. Updated each session. **Read this first.**

---

## What Is Monorail?

An MCP tool that lets Claude and humans collaborate on presentation decks in Figma. Not "generate and export" — a live loop where both parties work in the same canvas.

**Named after:** Lyle Lanley's monorail pitch in The Simpsons — an argument so tight it sells the room.

---

## Documentation Guide

| When you need... | Go to... |
|------------------|----------|
| Current project state | **This file** (PLAN.md) |
| How something works | `docs/references/` |
| Why we chose X over Y | `docs/decisions/` |
| What didn't work | `docs/failures.md` |
| Exploration before deciding | `docs/discovery/` |
| Quick start for new session | **This file** → "Next Session" section |

### The Ralph Wiggum Method

1. **Start by reading `PLAN.md`** — understand current state
2. **One focused task per session** — don't boil the ocean
3. **Log learnings to `docs/failures.md`** — gotchas, API quirks
4. **Update `PLAN.md` at session end** — brief summary, link to relevant docs
5. **Put details in docs/** — decisions, references, discoveries

**Rule of thumb:** If it's reusable knowledge, it goes in `docs/`. If it's project state, it stays in PLAN.md.

---

## Current State

**v0 complete.** Full round-trip loop working.

**Session 11 complete.** Rich read + targeted write working.

### What Works ✅
- WebSocket bridge — no copy/paste, live sync
- Rich export — captures ALL elements with Figma node IDs
- Targeted patches — update specific elements, preserve layouts
- 10 hardcoded archetypes (title, bullets, big-idea, etc.)

### The Gap 🔨
- **New slides don't match existing styles** — archetypes are hardcoded
- **Need: Dynamic Templates** — extract from Figma, instantiate with new content

### Key Files
| File | Purpose |
|------|---------|
| `figma-plugin/code.ts` | Plugin: export, apply, patch |
| `src/index.ts` | MCP server + WebSocket |
| `docs/references/mcp-tools.md` | Tool documentation |
| `docs/decisions/dynamic-templates.md` | Next major feature design |

---

## What's Next

**Dynamic Templates** — see `docs/decisions/dynamic-templates.md`

The next session is a **DESIGN session**, not coding:
- Walk through "make SOLUTION slide like slide-10" end-to-end
- Decide: How to identify template slots vs decoration?
- Decide: Where do templates live? (Figma components? JSON?)
- Spike: Can we read full frame structure from plugin?

---

## Session Log

### Session 11 (2026-01-11)
**Rich Read + Targeted Write**

Built:
- Recursive element finder (`getAllTextNodes`)
- Element classification (headline, accent_text, diagram_text)
- `monorail_patch_elements` tool

Proved:
- Can read 25+ elements from complex slide (was: just headline)
- Can patch specific elements without destroying layout

Discovered:
- New slide creation doesn't match existing custom styles
- Need dynamic templates → see `docs/decisions/dynamic-templates.md`

### Session 10 (2026-01-11)
**Plugin API Audit + Design System Strategy**

- Implemented Auto Layout for bullets, gradients for title
- Key insight: Gap is USAGE, not capability
- Breakthrough: Intent-based collaboration model

Details: `docs/decisions/design-system-strategy.md`

### Sessions 1-9
See git history. Key milestones:
- Session 3: v0 loop complete
- Session 5: Freeform edit handling
- Session 8: WebSocket bridge complete

---

## Quick Reference

```
monorail-mcp/
├── PLAN.md                    # You are here
├── src/index.ts               # MCP server
├── figma-plugin/              # Figma plugin
└── docs/
    ├── decisions/             # Why we chose X
    │   ├── dynamic-templates.md   ← NEXT
    │   ├── design-system-strategy.md
    │   ├── websocket-bridge.md
    │   └── ...
    ├── references/            # How things work
    │   ├── mcp-tools.md
    │   ├── plugin-api.md
    │   ├── archetypes.md
    │   └── ...
    ├── discovery/             # Spikes before decisions
    └── failures.md            # What didn't work
```

---

## Next Session Prompt

Copy this to start:

```
I'm working on Monorail — Claude + human collaboration on decks via Figma.

**Read first:** PLAN.md, then docs/decisions/dynamic-templates.md

**Current state:**
- Rich read + targeted write: WORKING
- New slide creation: doesn't match existing styles
- Next: Dynamic templates design session

**This session:** Design session for dynamic templates
- Not coding — figuring out HOW templates should work
- Key questions in docs/decisions/dynamic-templates.md
- Goal: Clear implementation plan for next coding session
```
