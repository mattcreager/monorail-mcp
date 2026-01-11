# Monorail: Architecture Spec

A system for making decks with narrative coherence, using Claude + Figma as a collaborative canvas.

## The Core Insight

A deck is an argument with a shape. Most AI deck tools optimize for slide generation. Monorail optimizes for **finding and refining the argument**, with constant visual feedback.

The key unlock: **Figma as shared canvas, not just output target.**

```
     Claude (Cursor)                    Figma
        │                                 │
        │    monorail_push_ir            │
        ├────────────────────────────────►│  Plugin auto-applies
        │         (via WebSocket)         │
        │                                 │
        │                            Human edits:
        │                            move, restyle,
        │                            add content
        │                                 │
        │    monorail_pull_ir            │
        │◄────────────────────────────────┤  Plugin exports IR
        │         (via WebSocket)         │
        │                                 │
        │    Claude sees changes,         │
        │    adapts                       │
        └─────────────────────────────────┘
```

Both parties work in the same space. Claude proposes, human spikes, Claude sees and adapts. **No copy/paste required.**

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

### 3. Figma Plugin (`figma-plugin/`)

**Writes** IR → Figma Slides:
- Creates slides from IR (all 10 archetypes)
- Updates existing slides (in-place text updates preserve formatting)
- Names text nodes (`headline`, `bullet-0`, etc.) for targeted updates
- Maintains mapping: IR slide id ↔ Figma frame id

**Reads** Figma → IR (Export):
- Analyzes slide content, detects archetypes
- Extracts structured content (headlines, bullets, etc.)
- Captures `extras` (text outside archetype patterns)

**Critical behavior**: 
- Respect `status: locked`. Don't overwrite.
- Same archetype → update text in place (preserves human formatting)
- Different archetype → full re-render

### 4. MCP Server + WebSocket Bridge

**Custom MCP server** (`src/index.ts`) with WebSocket for Figma communication:

| Tool | Purpose |
|------|---------|
| `monorail_connection_status` | Check if plugin is connected |
| `monorail_push_ir` | Send IR to plugin (auto-apply) |
| `monorail_pull_ir` | Request export from plugin |
| `monorail_create_deck` | Create deck (in-memory) |
| `monorail_preview` | Generate HTML preview |

**Why custom MCP?** The official Figma MCP doesn't support Slides, and REST API is read-only for design content. WebSocket bridge connects directly to the Figma plugin.

This is how Claude sees your spikes. You move slide 7, change a headline, add a sketch—Claude pulls IR and sees it.

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

## What Exists (v0 Complete ✅)

| Component | Status | Location |
|-----------|--------|----------|
| Narrative skill (SKILL.md) | ✅ Done | `docs/SKILL.md` |
| IR format spec | ✅ Done | `docs/PLUGIN-SPEC.md` |
| Figma Plugin | ✅ Working | `figma-plugin/` |
| MCP server | ✅ Working | `src/index.ts` |
| WebSocket bridge | ✅ Working | Port 9876 |
| Archetype rendering | ✅ Working | 10 archetypes in plugin |
| Critic heuristics | ✅ Done | `docs/references/critics.md` |

**The loop is closed.** Full round-trip works: Claude ↔ Figma via WebSocket.

---

## Test Case: The Monorail Deck

Dogfood by building a deck that explains Monorail itself.

**Brief**: Explain the Monorail system to someone evaluating it for their team.

**Audience**: Technical PM or design lead who's frustrated with current deck workflows.

**Ask**: Try Monorail for their next important deck.

**Constraint**: 8-10 slides, 10 minutes.

This forces us through the whole loop and surfaces gaps.

---

## Answered Questions

| Question | Answer |
|----------|--------|
| Plugin architecture? | Figma plugin with WebSocket client → connects to MCP server |
| MCP read granularity? | Export returns full IR; change detection via `extras` field |
| Component library? | Plugin renders archetypes directly (hardcoded layouts) |
| Locking mechanism? | `status` in IR only; plugin respects `locked` slides |
| Chart handling? | Placeholder text for v0 |

---

## Open Questions (v1+)

1. **Visual feedback** — Claude can't see rendered output (text overflow, broken layouts)
2. **Template integration** — Our archetypes bypass Figma's native template system
3. **Design co-creation** — HTML output is rich, Figma output is functional text
4. **Delete capability** — Plugin can only create/update, not delete slides

---

## What's Next

See `PLAN.md` for current session tasks and detailed roadmap.

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
