# Decision: Freeform Edit Handling

**Date:** 2026-01-11  
**Status:** Implemented ✅ (Session 5)  
**Context:** Session 4 design discussion

---

## Problem Statement

The current round-trip loop has two friction points that break seamless collaboration:

1. **Export is lossy** — human additions that don't fit archetypes are ignored
2. **Apply is destructive** — re-renders slides from scratch, destroying human formatting

This means every Claude iteration bulldozes human work instead of integrating with it.

---

## Decision

**Update in place + Capture extras**

The collaboration model should feel like two people editing the same Google Doc — Claude's changes merge with human's changes, they don't overwrite them.

### Export (Figma → IR)

- Detect archetype and extract structured content (current behavior)
- **NEW:** Also capture `extras` — any text that doesn't fit the archetype pattern
- Extras are unstructured but visible to Claude

### Apply (IR → Figma)

- If slide exists AND archetype unchanged: **update in place**
  - Find text nodes by name (`headline`, `bullet-0`, etc.)
  - Update `.characters` only — preserve position, font, color
  - Don't touch nodes we didn't create (human additions survive)
- If slide is new OR archetype changed: **full re-render** (current behavior)

---

## IR Schema Change

Add optional `extras` field to slides:

```yaml
- id: slide-3
  archetype: bullets
  content:
    headline: "Three Points"
    bullets: ["First", "Second", "Third"]
  extras:  # NEW
    - "Fourth bullet human added"
    - "Footnote text at bottom"
```

---

## Why This Approach

- **Minimal schema change** — one new field, backwards compatible
- **Preserves human polish** — position tweaks, font changes, added elements survive
- **Claude has full visibility** — sees extras, can decide what to do
- **Graceful fallback** — archetype changes still work (just re-render)
- **Incremental** — can implement Apply changes first, Export changes second

---

## Alternatives Considered

### A. Permissive — grab ALL text
- Export all text nodes regardless of archetype fit
- Problem: Loses structure, hard to round-trip position/styling
- Problem: IR becomes messy, hard for Claude to reason about

### B. Accept limitation — document that freeform edits don't survive
- Keep export clean and structured
- Problem: Breaks the "seamless collaboration" promise
- Problem: Human must work within rigid archetype constraints

### C. Full preservation with layers of ownership
- Explicitly separate "Claude's layer" from "human's layer"
- Problem: Complex to implement — how do you mark ownership?
- Problem: Overkill for v1

---

## Implementation Notes

### Text Node Naming Convention

On creation, name nodes so we can find them later:

```
headline, subline, bullet-0, bullet-1, bullet-2,
left-title, left-body, right-title, right-body,
quote, attribution, takeaway, stage-0-label, etc.
```

### Apply Logic Pseudocode

```
for each slide in IR:
  existingNode = lookup from mapping
  
  if !existingNode:
    createSlideWithContent(slide)  # full render
  
  else if slide.archetype != detectArchetype(existingNode):
    clearAndRerender(existingNode, slide)  # archetype changed
  
  else:
    updateContentInPlace(existingNode, slide)  # preserve formatting
```

### Export Logic for Extras

```
analyze text nodes for archetype
extract structured content (current)

extras = []
for each text node not claimed by archetype detection:
  extras.push(node.characters)

return { archetype, content, extras }
```

---

## Open Questions (for future sessions)

1. **Should extras include position hints?** e.g., `{ text: "footnote", region: "bottom" }`
2. **What if human deletes an archetype element?** (headline gone — error? re-create?)
3. **Should Claude be able to modify extras?** Or are they human-only domain?
4. **Visual feedback:** Claude still can't *see* the rendered output — separate problem

---

## Implementation Tasks

- [x] Update `addText()` and `addContentToParent()` to name text nodes consistently
- [x] Change Apply logic to update existing text nodes by name instead of clearing/re-rendering
- [x] Update `analyzeSlideContent()` to capture unrecognized text in an extras array
- [x] Add `extras` field to Slide interface and SlideContent types
- [ ] Document new `extras` field and update-in-place semantics in PLUGIN-SPEC.md
- [x] Test: create slide → add human content → export → modify via Claude → apply → verify human additions survive
