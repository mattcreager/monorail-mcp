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

## Decision

**Proceed with Monorail Design System as proof of concept.**

Build it, test it, use it for our own content. If it works, the pattern generalizes.

This validates the entire "Phase 2: Production" vision before we invest in generalization.
