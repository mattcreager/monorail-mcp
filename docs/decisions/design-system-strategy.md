# Design Decision: Design System Strategy

**Date:** 2026-01-11  
**Status:** Proposed  
**Context:** Session 10 discussion on Claude/plugin capabilities for visual collaboration

---

## The Problem

Claude can help with deck **content** (structure, argument, copy), but struggles with **visual design**. The Plugin API audit showed we CAN create sophisticated visuals — but how does Claude know what to create?

Current state:
- Hardcoded colors, fonts, layouts in plugin
- No connection to user's brand/design system
- Claude generates content, plugin renders with fixed styling
- Output is "Monorail style", not "their style"

---

## The Vision: Two-Phase Collaboration

### Phase 1: Sketch
- Rough, messy, whiteboard-style
- Human + Claude iterate on **structure and argument**
- "What slides? What order? What's the ask?"
- Visuals are functional, not polished

### Phase 2: Production  
- Human says "OK, make it consistent with our design system"
- Claude **reads** the design system
- Claude **applies** it intelligently per slide
- "This is a quote slide → use Quote Template with brand colors"

Different slides can be in different phases. The system supports multi-rate collaboration.

---

## Design System Sources (Layered)

### 1. Bring Your Own
- User has existing design system (work brand, conference theme)
- Claude learns it from:
  - Figma file (read styles, components)
  - Human description ("headline is Inter Bold, accent is #DC2626")
  - Screenshot (Claude infers from visual)
- Works for enterprise users with brand guidelines

### 2. Generate One
- For one-off decks without existing system
- Claude proposes based on content + best practice
- "Technical talk → clean, minimal, code-friendly fonts"
- "Pitch deck → bold, energetic, high contrast"
- Could generate a full Figma template or just style guidance

### 3. Monorail Default
- Reference implementation we ship
- Serves multiple purposes:
  - Example of how design systems work
  - Lighthouse for our own content (Monorail docs)
  - Default for users exploring without their own system
- **Critical:** This is also the proof of concept

---

## The Monorail Design System as Proof of Concept

Building our own design system first lets us validate:

1. **Can the plugin read design systems?**
   - Export styles via `getLocalPaintStylesAsync()`, `getLocalTextStylesAsync()`
   - Export components via component listing APIs
   - Capture semantic meaning (what's "headline" vs "accent"?)

2. **Can Claude understand them?**
   - What format makes design systems comprehensible?
   - How much human annotation is needed vs. inference?
   - Can Claude map content types → appropriate templates?

3. **Can the plugin apply them?**
   - Generate component instances instead of raw nodes
   - Apply style references instead of hardcoded colors
   - Maintain user's visual language while adding content

If it works for Monorail's system, it works for any system.

---

## Technical Requirements

### Export Enhancements
- `monorail_pull_design_system` tool (new)
- Returns: colors, fonts, components, semantic mapping
- Or: extend `monorail_pull_ir` to include system info

### IR Schema Extensions
```json
{
  "design_system": {
    "colors": {
      "background": "#0f0f1a",
      "headline": "#fef3c7",
      "accent": "#dc2626"
    },
    "fonts": {
      "headline": { "family": "Inter", "weight": "Bold" },
      "body": { "family": "Inter", "weight": "Regular" }
    },
    "components": {
      "title-slide": "component-id-123",
      "bullet-slide": "component-id-456"
    }
  },
  "slides": [...]
}
```

### Apply Enhancements
- Use `component.createInstance()` instead of raw node creation
- Apply style references: `node.fillStyleId = styleId`
- Preserve design system consistency across slides

### MCP Resources
- `monorail://design-system` — current active system
- `monorail://design-system-spec` — how to structure a system
- Documentation Claude can reference

---

## Implementation Path

### Step 1: Build Monorail Design System (Figma)
- Create Figma file with:
  - Color styles (named semantically: `background`, `headline`, `accent`, etc.)
  - Text styles (named: `headline`, `subline`, `body`, `caption`)
  - Slide components (Title, Bullets, Quote, etc.)
- This becomes our template file

### Step 2: Export Design System
- New tool or enhanced export that reads styles/components
- Output format Claude can understand
- Test: Can Claude describe what it sees?

### Step 3: Apply with Design System
- Modify Apply to use component instances
- Apply style references instead of hardcoded values
- Test: Does output match the design system?

### Step 4: Generalize
- Test with a different design system (not Monorail)
- Validate the pattern works for "bring your own"
- Document how users can set up their own

---

## Open Questions

1. **Semantic mapping** — How does Claude know "this color is for emphasis"?
   - Convention-based naming?
   - Explicit metadata in IR?
   - Human annotation?

2. **Component selection** — How does Claude choose which template for each slide?
   - Archetype → component mapping?
   - Content analysis?
   - Human override?

3. **Screenshot understanding** — Can Claude infer design system from visual?
   - Would enable "match this existing deck's style"
   - Requires visual analysis capabilities
   - Could be powerful for "bring your own" without explicit export

4. **Maturity model** — How does IR capture "this slide is sketch vs production"?
   - Per-slide maturity flags?
   - Separate sketch/production modes?

---

## Evolution: IR as Delta/Intent (Session 10 insight)

**The fidelity problem:**
- Current IR captures content, loses visual state
- Export is lossy → Claude can't see what human did
- Apply re-renders → destroys human's visual work
- Result: Claude and human CONFLICT instead of collaborate

**Key insight:** Maybe IR shouldn't be a complete state description. Maybe it should be **delta/intent**.

### Current Model (State-based)
```
IR = complete slide specification
Plugin renders from scratch each time
Human edits get destroyed on next Apply
```

### Proposed Model (Delta-based)
```
IR = changes/intent to apply
Plugin patches existing slides
Human edits persist
```

**Like Git:** Commits (deltas) vs. full file snapshots.

### What this enables:
- Human moves headline → stays moved
- Claude updates headline TEXT → position preserved  
- Human adds callout → stays there
- Claude adds bullet → inserted without destroying callout

### Visual feedback is critical:
- Claude needs to SEE the current state (screenshot or rich export)
- Claude understands what human did
- Claude sends targeted changes that work WITH not against

### IR evolution example:
```json
// OLD: "Here's the complete slide"
{
  "archetype": "bullets",
  "content": { "headline": "...", "bullets": [...] }
}

// NEW: "Here's what to change"
{
  "slide_id": "slide-1",
  "intent": "update_content",
  "changes": [
    { "target": "headline", "value": "New Title" },
    { "target": "bullet-0", "value": "Updated bullet" },
    { "action": "add_bullet", "value": "New bullet at end" }
  ]
}
```

### Open questions for delta model:
- How does Claude specify new slides? (Still need state-based for creation)
- How granular are the deltas? (Text only? Position? Style?)
- How does Claude know what's there to change? (Visual feedback)
- Hybrid model? (State for new slides, delta for updates)

---

## Evolution 2: Intent-Based Collaboration (Session 10 breakthrough)

**The framing shift:** It's not "export/import" — it's Claude READING and WRITING.

### The Core Principle

**Claude works in INTENT/CONTENT. System handles RENDERING.**

| | What Claude provides | What system does |
|---|---|---|
| **Modify** | "Change headline to X, update point 2 to Y" | Patch in place |
| **Create** | "Slide about X with 3 points and a diagram" | Pick template, layout, render |

**The design system is the "how" layer.** Claude says WHAT, design system determines HOW it looks.

### Two Modes

**MODE 1: Review + Modify (existing slide)**
```
Claude READS structure → understands what's there → sends CHANGES → System patches
```
- Read format tells Claude what exists
- Write format is targeted modifications
- Existing structure (especially human work) preserved

**MODE 2: Create (new slide from prompt)**
```
Human: "I need a slide about X" → Claude expresses INTENT → System renders
```
- No existing structure to preserve
- Claude expresses content + intent, not pixels
- System uses design system to render

### Real Example: Complex Slide

Screenshot showed: section label, headline, 3 accent text blocks, complex diagram
IR captured: just the headline, `archetype: unknown`

**With intent-based model:**

Claude READS:
```json
{
  "slide_id": "slide-10",
  "structure": {
    "section_label": "CHALLENGE+SOLUTION",
    "headline": "Traditional access is static...",
    "accent_blocks": [
      { "id": "block-1", "text": "Give agents broad access..." },
      { "id": "block-2", "text": "Limit agent capabilities..." },
      { "id": "block-3", "text": "Build custom access controls..." }
    ],
    "diagram": { "type": "complex", "description": "Agent architecture flow" }
  }
}
```

Claude WRITES (modifications):
```json
{
  "slide_id": "slide-10",
  "changes": [
    { "target": "headline", "value": "Traditional access creates an impossible choice" },
    { "target": "block-2.text", "value": "Restrict agent capabilities and lose business value." }
  ],
  "preserve": ["diagram"]  // Don't touch this
}
```

Claude WRITES (new slide):
```json
{
  "intent": "challenge_solution",
  "content": {
    "section_label": "CHALLENGE+SOLUTION",
    "headline": "...",
    "pain_points": ["...", "...", "..."],
    "diagram_description": "Show agent accessing services through MCP"
  }
}
```

### Why This Works

1. **Claude stays in its strength** — Language, structure, argument
2. **System handles rendering** — Design system, templates, Figma specifics
3. **Human work is preserved** — Deltas don't destroy what Claude can't see
4. **Same mental model for read and write** — What you read is what you can modify
5. **Visual feedback enables understanding** — Screenshot + rich read = Claude knows what's there

---

## Decision

**Proceed with Monorail Design System as proof of concept.**

Build it, test it, use it for our own content. If it works, the pattern generalizes.

This validates the entire "Phase 2: Production" vision before we invest in generalization.
