# Dogfooding Gaps Discovery

> Session: 2026-01-11 — Rendering the Monorail deck using Monorail

## What We Tested

Rendered the 10-slide HTML deck (`examples/monorail-deck-v0.html`) through the MCP → Figma pipeline.

## What Worked ✅

- **Full deck push** — 10 slides created in one shot
- **Core archetypes** — title, bullets, big-idea, two-column, quote, summary, timeline all rendered
- **Auto Layout for bullets** — properly handles variable-length lists
- **Timeline with markers** — 4 stages with dots, connecting lines, labels

## Gaps Found 🔨

### 1. Slide Positioning (HIGH)
**Problem:** New slides append to end of deck, not inserted at position.  
**Impact:** Deleted slide-5, recreated it, went to end instead of position 5.  
**Fix:** Add `position` or `after` parameter to push_ir, or add reorder tool.

### 2. Big-Idea Overlap (FIXED ✅)
**Problem:** Fixed Y positions caused headline/subline overlap when headline wrapped.  
**Fix:** Changed to Auto Layout container. Committed in this session.

### 3. Limited Diagram/Visualization Support (MEDIUM)
**Problem:** Timeline is linear only. HTML had:
- Return loop arrows ("← see it → react → adjust ←")
- Callout boxes
- Visual emphasis (bordered "Figma" box)

**Current:** Can only do linear left-to-right timeline with dots.  
**Options:**
- Add `loop` archetype with bidirectional arrows
- Add `callout` as optional element on any slide
- Explore Figma connector/arrow APIs

### 4. Call-and-Response Layout (LOW)
**Problem:** HTML had a nice Q&A grid layout (question on left, answer on right).  
**Workaround:** Used bullets with "Q → A" format.  
**Option:** Add `call-response` archetype with grid layout.

### 5. Archetype Detection on Export (LOW)
**Problem:** Bullets slides export as `archetype: "unknown"` because detection doesn't recognize `bullets-container` frame.  
**Impact:** Round-trip loses archetype info (write works, read doesn't recognize).  
**Fix:** Update `detectExistingArchetype()` to check for `bullets-container`.

### 6. Design System Application (FUTURE)
**Problem:** All slides render with Inter font + default dark theme.  
**HTML had:** SF Pro Display, cream headlines (#fef3c7), red accents (#dc2626), gradient backgrounds.  
**Status:** We have `extract_design_system` and `create_styled_slide`, but didn't test full pipeline.

## Next Steps

Priority order for fixes:
1. **Slide positioning** — critical for collaboration loop
2. **Archetype detection** — quick fix for round-trip fidelity
3. **Callout support** — adds visual richness
4. **Loop/diagram** — harder, needs Figma arrows research
