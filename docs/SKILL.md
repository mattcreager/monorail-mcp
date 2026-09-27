---
name: monorail-narrative
description: Thinking toolkit for creating decks with narrative coherence. Use when helping users create presentations, pitch decks, or slides. Provides frameworks for finding arguments, testing structure, and maintaining quality—not a rigid workflow, but a set of tools to use throughout a fluid creative process.
---

# Monorail: Narrative Toolkit

A deck is an argument with a shape, not a container for information.

This toolkit provides thinking frameworks. Use them fluidly throughout the deck-making process—not as sequential stages, but as lenses to apply when needed.

---

## The Spine

Every deck needs a spine: the core argument in three parts.

**Setup**: The world as it is. The problem. The opportunity. What's at stake.

**Turn**: The shift. Why now. What changes. The insight that reframes.

**Landing**: The ask. The answer. What you want them to do or remember.

### Finding the Spine

Questions to ask:
- What's the situation this deck responds to?
- Who's in the room? What do they already believe?
- What do you want them to *do* after?
- What's the one thing they should remember tomorrow?

### The Hallway Test

> If someone walks out and a colleague asks "what was that about?"—what's the one sentence they say?

That sentence must exist. It must be concrete. "It was about our strategy" = no spine. "We'll hit a support crisis in Q3 unless we automate tier-1 now" = spine.

### Spine Red Flags

| Signal | Problem |
|--------|---------|
| Setup takes 5+ sentences | Too much context, not enough argument |
| Turn is vague ("we should improve") | No concrete shift |
| Multiple asks | No clear landing |
| Can't state it in 60 seconds | Not distilled enough |

---

## Beats

Beats are narrative moves. Each beat has a **job** in the argument.

Example jobs:
- Establish stakes
- Create tension  
- Introduce the turn
- Provide proof
- Handle objection
- Land the ask

A beat is not a slide. A beat might become one slide or three. The beat defines *what it does for the argument*; slides are how it gets delivered.

### The Deletion Test

For each beat: *"If I deleted this, would the argument still work?"*

- If yes → filler. Cut it or find its real job.
- If no → structural. Keep it.

### Beat Sequence

Typical shape:
1. Stakes (why care?)
2. Tension (what's wrong? what's at risk?)
3. Turn (the insight, the solution, the reframe)
4. Proof (evidence it works)
5. Objection handling (why not X instead?)
6. Landing (the ask, the takeaway)

The **turn** should be identifiable. You should be able to point to the beat where the deck shifts from problem to solution.

---

## Archetypes

Slides come from constrained templates. Constraints force clarity.

| Archetype | Use | Limits |
|-----------|-----|--------|
| Title | Opening, sections | Headline ≤8 words |
| Section | Divider | ≤5 words |
| Big Idea | Key insight, turn | Headline ≤12, subline ≤20 |
| Bullets | Supporting points | 3 bullets, ≤10 words each |
| Two-Column | Comparison, text+image | 2 blocks |
| Quote | Testimonial | ≤30 words + attribution |
| Chart | Data evidence | Insight headline + chart + takeaway |
| Timeline | Process | 3-5 stages |
| Comparison | Options | 2-4 cols, 3-5 rows |
| Summary | Closing | 3 items max |

### When Content Overflows

The content needs editing. The constraint doesn't need loosening.

- Headline too long → shorter words, fewer modifiers
- Too many bullets → combine or split slides
- Chart too complex → simplify data or different viz

---

## Critic Checks

Run these continuously, not as a discrete phase.

### Narrative Checks

- [ ] Does slide 1 open a question the final slide answers?
- [ ] Can you point to the turn slide?
- [ ] Is the hallway sentence literally on a slide?
- [ ] Any slide deletable without breaking the argument?
- [ ] Do stakes appear before the turn?

### Visual Checks

- [ ] All text within containers (no overflow)
- [ ] Constraints respected (word counts, bullet counts)
- [ ] Consistent typography
- [ ] Headlines are insights, not descriptions

### Routing Failures

When something's off, which level needs work?

| Symptom | Fix at |
|---------|--------|
| "I don't know what they want" | Spine (landing) |
| "The ending doesn't land" | Spine |
| "Slide 7 feels like filler" | Beats |
| "When does it shift?" | Spine or Beats (turn) |
| "This bullet is too long" | Content (archetype constraints) |
| "Who cares?" | Spine (stakes) |

---

## Working With Human Edits

When the human spikes a slide directly in Figma:

1. **See it**: Read current deck state via MCP
2. **Understand it**: What did they change? What does it imply?
3. **Adapt**: Adjust surrounding slides to match. Ask if the change suggests a spine/beat shift.

Human edits are signal. They often express what the human couldn't articulate in words.

---

## Partial Locking

Different slides are at different stages of done-ness. That's normal.

- **Locked**: Content is settled. Don't regenerate.
- **Draft**: In progress. Open to revision.
- **Stub**: Placeholder. Needs work.

Track status. Respect locks. Focus energy on what's still in flux.

---

## Key Principles

**The render is the thinking medium.**
You can't evaluate a deck by looking at outlines. You need to see it. Render early, render often.

**Constraints are features.**
Word limits force clarity. Archetype limits force focus. Fight the urge to "just add one more bullet."

**Filler is cancer.**
Every slide must have a job. "Provides context" is not a job unless you can say *what* context and *why* they need it before proceeding.

**The hallway sentence is the test.**
If you can't say what the deck is about in one concrete sentence, it's not done.

**Looping back is progress.**
Discovering at slide 8 that your spine is weak means the process worked. You found it before you presented.

---

---

## Monorail Workflow Patterns

Practical patterns learned from real deck-building sessions.

### The Ralph Wiggum Loop

Screenshot after every change. Don't trust that it worked—verify visually.

```
1. Make change (push, primitives, patch)
2. Screenshot immediately (scale 0.4-0.55)
3. Evaluate: Does it look right?
4. If not: iterate
```

**Screenshot scale:** Use 0.4-0.55. Smaller is unreadable, larger overwhelms context.

### Delete + Recreate > Patch

`monorail_patch` is unreliable. When you need to change content on a slide:

```
1. Pull the slide to see current structure
2. Delete the slide with monorail_delete
3. Recreate with monorail_primitives (copy structure, change content)
```

This is more reliable than debugging patch argument formats.

### Primitives Positioning Guide

Standard 1920x1080 slide coordinates:

| Element | X | Y | Width | Notes |
|---------|---|---|-------|-------|
| Left margin | 60 | - | - | Standard content start |
| Headline | 60 | 30-50 | - | Top of slide |
| Subhead | 60 | 90-110 | - | Below headline |
| Full-width box | 60 | - | 1200 | Spans most of slide |
| Left column | 60 | - | 580 | For two-column |
| Right column | 680 | - | 580 | For two-column |
| Bottom bar | 60 | 430-500 | 1200 | Footer/summary |

**Corner radius:** 8-16px for boxes. Use consistent radius within a slide.

### Full-Slide Rebuild Pattern

For complex slides with diagrams, custom layouts, or many elements—build from scratch with `monorail_primitives` rather than fighting archetypes.

Primitives give you:
- Exact positioning control
- Custom color schemes
- Mixed element types (text + rect + line)
- Visual hierarchy through layering

### Reveals: declare build steps once, let Monorail pick the native mechanism

Author the settled slide once and mark what arrives later. Never hand-build
one slide per state.

```
1. Build the settled state with monorail_primitives.
2. Put `reveal` on any named op that should arrive later:
     { "op": "text", "name": "work", ..., "reveal": 1 }
     { "op": "text", "name": "ownership", ..., "reveal": { "step": 2, "style": "fade in" } }
3. Read the result: it lists either Motion reveals or the step slides it made.
4. Screenshot each step slide; monorail_motion inspect on the slide IDs shows
   the enter transitions.
```

What happens depends on the editor (`build_mode: "auto"`):

- **Design editor** — `figma.motion` exists. Each element gets a Motion
  animation style at offset step × `step_seconds`; no style match → an
  opacity keyframe. One slide.
- **Figma Slides** — the Plugin API exposes no object animations
  (`figma.motion` is undefined; Slides' Object animations panel has no API).
  Default: **one slide, one transparent frame per step** named `Reveal 1`,
  `Reveal 2` (`· exit after k` when an element leaves). Slides allows one object
  animation per object and a frame is one object, so the presenter finishes
  with one click per group in the Animate tab: Fade in, On click. Tell the user
  this explicitly — it is the only manual step.
- `build_mode: "slides"` instead clones the slide into one slide per step with a
  native `SMART_ANIMATE` transition (or `DISSOLVE`). No manual step, but N slides
  per scene in the grid; the clones are named `name · k/N`.

Rules of thumb:

- Elements that mask a connector (a label on a line) take the *same* step as
  the line, or the line shows through before the label arrives.
- Only top-level children of the slide become steps; nest inside a frame if a
  group must arrive together.
- To animate an existing slide: `monorail_pull` for node IDs, then
  `monorail_motion apply` with `reveals`. Applying again to a slide that already
  has step slides or groups makes more — delete the old slides / ungroup first.
- `monorail_motion list` and `clear` are Motion-only and error in Slides.

### Reordering for Narrative

Use `monorail_reorder` freely. It's reliable and lets you restructure the deck without touching content.

Pattern:
```
1. Build slides in any order
2. Pull summary to see current order
3. Reorder to match narrative flow
4. Screenshot key slides to verify
```

---

## References

- `references/archetypes.md` — Detailed specs per archetype
- `references/narrative.md` — Theory: stakes, tension, turns
- `references/critics.md` — Expanded QA heuristics
- `discovery/sales-deck-patterns.md` — Patterns for sales/pitch decks