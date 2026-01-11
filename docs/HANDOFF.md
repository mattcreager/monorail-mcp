# Monorail: Handoff Context

## What Is This?

**Monorail** is a system for making presentation decks that have narrative coherence—not just pretty slides. It's an MCP tool that gives Claude the ability to read and write Figma Slides, enabling a collaborative loop where Claude proposes, human spikes directly in Figma, and Claude sees the changes and adapts.

Named after The Simpsons' "Marge vs. the Monorail" episode—Lyle Lanley's pitch is a masterclass in narrative structure. The argument lands so hard it sells Springfield a monorail (which turns out to be a disaster, but the pitch was flawless).

### The Names

| Name | Reference | Meaning |
|------|-----------|---------|
| **Monorail** | The episode/pitch | The product — decks with arguments that land |
| **Ralph Wiggum** | The development methodology | How we build — iterative loops until done |

We use the **Ralph Wiggum approach** (persistent plan, clean sessions, findings log) to develop the product. See `PLAN.md` at project root.

---

## Files in This Project

### Core Specs
- **ARCHITECTURE.md** — The complete system vision. Start here.
- **SKILL.md** — Narrative toolkit for Claude (spine, beats, hallway test, constraints)
- **PLUGIN-SPEC.md** — Detailed spec for the Figma plugin/MCP tool

### Reference Material
- **references/archetypes.md** — The 10 constrained slide templates with word limits
- **references/narrative.md** — Theory: spines, turns, stakes, argument structure
- **references/critics.md** — QA heuristics for checking deck quality at each level

### Outputs
- **index.html** — Landing page for Monorail (has the Lyle Lanley energy)
- **monorail-deck-v0.html** — The Monorail pitch deck built using the system
- **test-briefs/000-monorail-deck.md** — The brief used to create that deck

### Meta
- **failures.md** — Empty log, will accumulate learnings as we iterate

---

## Current State

**What exists:**
- Complete architecture spec
- Narrative skill doc (thinking toolkit, not rigid workflow)
- Plugin spec (IR format, operations, UI sketch)
- Landing page with proper branding/tone
- Demo deck that shows the system works

**What needs building:**
1. **Figma MCP integration** — Verify what we can read/write via existing Figma MCP. May need custom MCP server.
2. **Figma plugin** — Takes IR (deck.yaml), writes to Figma Slides, maintains ID mapping
3. **Archetype component library** — 10 slide templates as Figma components
4. **End-to-end test** — Run the full loop: brief → Claude → IR → Figma → human edits → Claude sees → iterate

---

## The Core Loop

```
     Claude                          Human
        │                              │
        │    writes via MCP            │
        ├─────────────────────────────►│
        │                              │
        │         FIGMA SLIDES         │
        │                              │
        │    reads via MCP             │
        │◄─────────────────────────────┤
        │                              │
        │                         spikes, edits,
        │                         moves things
```

The insight: Figma isn't just an output target—it's a shared canvas. Both Claude and human work in the same space. Claude sees human edits and adapts.

---

## The Narrative Model

Every deck needs a **spine**:
- **Setup** — The world as it is. The problem. The stakes.
- **Turn** — The shift. Why now. What changes.
- **Landing** — The ask. The takeaway.

**Hallway test**: If someone walks out and a colleague asks "what was that about?"—what's the one sentence they say? That sentence should be concrete and should appear on a slide.

**Deletion test**: For every slide, ask "if I cut this, does the argument break?" If no, it's filler.

---

## Key Design Decisions Made

1. **MCP, not Figma plugin** — It's a tool Claude has, not something you install in Figma
2. **IR as bridge** — Structured deck.yaml that Claude writes, plugin renders to Figma
3. **Partial locking** — Slides have status: locked | draft | stub. Claude respects what's settled.
4. **Constraints force clarity** — Headlines ≤8 words, 3 bullets max, etc. If content overflows, edit the content, not the constraint.
5. **Continuous render** — You see the deck the whole time. Not "find shape then polish"—it's one fluid loop.

---

## Open Questions

1. **Figma MCP capability** — Can we read slide content? Detect changes since last write?
2. **Write mechanism** — Does Figma MCP support writes, or do we need a separate plugin?
3. **Component library distribution** — Ship as .fig file? Plugin creates them?
4. **Chart handling** — Probably placeholder-only for v0

---

## Next Steps

1. **Verify MCP** — Test what current Figma MCP can actually do
2. **Build plugin** — If MCP can't write, build a Figma plugin that can
3. **Build components** — 10 archetype templates in Figma
4. **Close the loop** — Test brief → Claude → IR → Figma → edit → Claude sees → iterate

---

## Vibe Check

The project has a specific tone: playful but substantive. The Simpsons references aren't decoration—they capture something real about the problem space.

- "What about us brain-dead slobs?" / "You'll be given cushy jobs!" — That's objection handling
- "I've sold monorails to Brockway, Ogdenville, and North Haverbrook" — That's credibility
- "Monorail!" (the crowd chanting) — That's the moment the argument clicks

Lean into it. The name is good. The energy is good. Now we build.
