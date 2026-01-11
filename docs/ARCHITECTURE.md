# Monorail: Architecture Spec

A system for making decks with narrative coherence, using Claude + Figma as a collaborative canvas.

## The Core Insight

A deck is an argument with a shape. Most AI deck tools optimize for slide generation. Monorail optimizes for **finding and refining the argument**, with constant visual feedback.

The key unlock: **Figma as shared canvas, not just output target.**

```
     Claude                          Human
        │                              │
        │    writes via plugin         │
        ├─────────────────────────────►│
        │                              │
        │         FIGMA SLIDES         │
        │                              │
        │    reads via MCP             │
        │◄─────────────────────────────┤
        │                              │
        │                         spikes, edits,
        │                         moves things
        │                              │
        │    sees your changes,        │
        │    adapts                    │
        └──────────────────────────────┘
```

Both parties work in the same space. Claude proposes, human spikes, Claude sees and adapts.

---

## The Loop

Not a waterfall. A continuous loop with visual feedback:

```
Brief → Spine → Beats → IR → Render → See it → React → Adjust
                              ↑                          │
                              └──────────────────────────┘
```

"Adjust" means different things at different moments:
- Change one word on slide 4
- Blow up the middle section
- Realize the spine was wrong
- Lock slides 1-3, keep iterating 4-10

Different slides are at different stages of done-ness. That's fine. The render is constant.

---

## Components

### 1. Narrative Skill (`SKILL.md`)

Teaches Claude how to think about decks:
- Spine (setup → turn → landing)
- Beats (narrative moves with jobs)
- The hallway test
- Deletion test
- Constraint discipline

**Not a workflow prescription.** A thinking toolkit Claude uses throughout the loop.

### 2. IR Format (`deck.yaml` / `deck.json`)

The intermediate representation. Structured spec of slides:

```yaml
slides:
  - id: slide-1
    archetype: title
    status: locked          # locked | draft | stub
    headline: "The Support Scaling Problem"
    subline: "Why we need to act before Q3 2026"
    speaker_notes: "Set context..."
    
  - id: slide-2
    archetype: chart
    status: draft
    headline: "Ticket Volume Is Outpacing Capacity"
    chart:
      type: line
      description: "Tickets vs. headcount, 2023-2026"
    takeaway: "The lines cross in Q3 2026."
```

Key fields:
- `id`: Stable identifier (survives reordering)
- `archetype`: Which slide template
- `status`: locked | draft | stub (Claude knows what's settled vs. in flux)
- Content fields per archetype

### 3. Figma Plugin

**Writes** IR → Figma Slides:
- Creates slides from IR
- Updates existing slides (doesn't regenerate locked ones)
- Uses Figma component library for archetypes
- Maintains mapping: IR slide id ↔ Figma frame id

**Critical behavior**: 
- Partial updates. Only touch slides whose IR changed.
- Respect `status: locked`. Don't overwrite.

### 4. MCP Integration

**Reads** Figma → Claude context:
- Current deck state (all slides, content, order)
- Detects human edits since last write
- Surfaces component library (available archetypes)

This is how Claude sees your spikes. You move slide 7, change a headline, add a sketch—Claude sees it on next read.

### 5. Critic Heuristics

QA checks Claude runs continuously (not as a discrete phase):

**Narrative:**
- Does slide 1's question get answered?
- Is the turn visible?
- Hallway sentence on a slide?
- Any slide deletable without breaking argument?

**Visual:**
- Text overflow?
- Constraints respected?

**Routing:** When something's wrong, which level to fix?
- "Ending doesn't land" → spine
- "Slide 7 is filler" → beats
- "Bullet too long" → IR/content

---

## Archetypes

Constrained slide templates. The plugin implements these as Figma components.

| Archetype | Purpose | Constraints |
|-----------|---------|-------------|
| Title | Opening, sections | Headline ≤8 words, subline ≤15 |
| Section | Divider | Phrase ≤5 words |
| Big Idea | Key insight, turn | Headline ≤12, subline ≤20 |
| Bullets | Supporting points | 3 bullets max, ≤10 words each |
| Two-Column | Comparison, text+image | 2 content blocks |
| Quote | Testimonial | Quote ≤30 words + attribution |
| Chart | Data evidence | Headline (insight) + chart + takeaway |
| Timeline | Process, roadmap | 3-5 stages |
| Comparison | Options, before/after | 2-4 cols, 3-5 rows |
| Summary | Closing, next steps | 3 items max |

Constraints force clarity. If content doesn't fit, edit the content.

---

## Interaction Model

### Human initiates
"I need a deck on X for Y audience"

### Claude gathers context
Uses narrative skill. Extracts spine, proposes beats. Asks clarifying questions.

### Claude generates IR
Maps beats to archetypes. Writes `deck.yaml`.

### Plugin renders to Figma
Human sees slides. Reacts.

### Human feedback loop
Options:
- **Talk**: "Slide 4 feels weak" → Claude adjusts IR, plugin updates
- **Spike**: Human edits directly in Figma → Claude reads via MCP, sees changes
- **Lock**: "Slides 1-3 are good" → Claude marks as locked, focuses elsewhere

### Loop continues
Until narrative QA passes and human says done.

---

## What Exists vs. What Needs Building

| Component | Status |
|-----------|--------|
| Narrative skill (SKILL.md) | v0 draft exists, needs update |
| IR format spec | Sketched above, needs formalization |
| Figma Plugin | **Needs building** |
| MCP integration | Figma MCP exists (read-only), need to verify capability |
| Archetype components | **Needs building** (Figma component library) |
| Critic heuristics | v0 draft exists in references/ |

**Critical path**: Plugin + Archetype components. Without write capability, loop doesn't close.

---

## Test Case: The Monorail Deck

Dogfood by building a deck that explains Monorail itself.

**Brief**: Explain the Monorail system to someone evaluating it for their team.

**Audience**: Technical PM or design lead who's frustrated with current deck workflows.

**Ask**: Try Monorail for their next important deck.

**Constraint**: 8-10 slides, 10 minutes.

This forces us through the whole loop and surfaces gaps.

---

## Open Questions

1. **Plugin architecture**: Figma plugin (runs in Figma) vs. external script that uses Figma API?
2. **MCP read granularity**: Can we detect *which* slides changed since last write?
3. **Component library location**: Ship archetypes as a Figma file users duplicate? Or plugin creates them?
4. **Locking mechanism**: Store `status` in IR only, or also tag in Figma somehow?
5. **Image/chart handling**: How does IR specify charts? Generate in Figma? Placeholder?

---

## Next Steps

1. **Verify MCP read capability** — What can we actually see from Figma via MCP?
2. **Spec the plugin** — Input/output, update semantics, component usage
3. **Build archetype components** — Figma file with the 10 templates
4. **Update SKILL.md** — Align with this architecture (toolkit, not workflow)
5. **Build Monorail deck** — Test the loop end-to-end

---

## Name

**Monorail**: From The Simpsons' "Marge vs. the Monorail." Lyle Lanley's pitch is a masterclass in narrative structure—setup, tension, objection handling, the whole town chanting by the end. The argument lands so hard it sells Springfield a disaster.

The irony is intentional: we're building a tool to make pitches land, named after a pitch that landed *too well*.

Quotable moments that map to the system:
- "Monorail!" — the moment the argument clicks
- "What about us brain-dead slobs?" / "You'll be given cushy jobs!" — objection handling
- "I've sold monorails to Brockway, Ogdenville, and North Haverbrook" — credibility beat

---

## How We Build This: The Ralph Wiggum Approach

We develop Monorail using the **Ralph Wiggum methodology** — an iterative AI development approach:

- **Persistent Plan** — `PLAN.md` tracks goals, state, and next steps across sessions
- **Clean Sessions** — Each session tackles one task with clear completion criteria  
- **Persistent Findings** — `docs/failures.md` logs learnings (survives context resets)
- **Iterative Loops** — Keep going until completion criteria are met

| Name | The Show | Our Project |
|------|----------|-------------|
| **Monorail** | The pitch that lands | The product — decks with narrative coherence |
| **Ralph Wiggum** | Persistent despite everything | The methodology — iterative loops until done |

The product is about iterative collaboration loops. We build it using iterative development loops. Loops all the way down.
