# Dynamic Templates: Design Decision

> Status: **DRAFT** — Needs design session before implementation

## The Problem

Current archetypes are hardcoded in `figma-plugin/code.ts`:
- 10 fixed templates (title, bullets, big-idea, etc.)
- Fixed colors, fonts, spacing
- Can't match user's existing design systems
- Can't learn from example slides

**Result:** New slides look like "Monorail default", not like the user's brand.

## Use Cases

### Use Case 1: Expand Existing Theme
> "Add a SOLUTION slide that matches my CHALLENGE slide"

User has slide-10 with custom styling:
- Section label ("CHALLENGE+SOLUTION")
- Accent blocks with colored borders
- Specific colors, fonts, spacing

Claude should:
1. Read slide-10's structure
2. Understand it as a "template"
3. Create slide-11 with same structure, different content

### Use Case 2: Create New Theme
> "Build me a design system for this deck"

User has no existing slides, wants Claude to:
1. Generate a design system (colors, fonts, spacing)
2. Create reference slides for each template type
3. User refines in Figma
4. Claude uses refined templates going forward

### Use Case 3: Apply Brand Guidelines
> "Here's our brand guide PDF, make the deck match"

User provides:
- Brand colors (hex values)
- Typography specs
- Logo/imagery guidelines

Claude should:
1. Parse brand guidelines
2. Generate templates that follow them
3. Apply to deck

---

## Key Questions

### Q1: Where do templates live?

| Option | Pros | Cons |
|--------|------|------|
| **Figma Components** | Native Figma workflow, designers understand it | Harder to read programmatically? |
| **JSON spec files** | Easy to version, diff, share | Separate from Figma, can drift |
| **Hybrid** | Best of both — Figma is source of truth, extract to JSON | More complexity |

### Q2: What's in a template?

Minimum viable template:
```json
{
  "template_id": "challenge-solution",
  "source_slide_id": "9:133",
  "slots": [
    { "role": "section_label", "frame_id": "...", "text_style": {...} },
    { "role": "headline", "frame_id": "...", "text_style": {...} },
    { "role": "accent_block", "frame_id": "...", "repeatable": true, "text_style": {...} }
  ],
  "background": {...},
  "layout": {...}
}
```

Questions:
- How much styling info to capture? (just colors? full text styles? positioning?)
- How to handle repeatable elements (3 accent blocks vs 5)?
- How to identify which frames are "slots" vs decoration?

### Q3: How does Claude request a template?

Option A: By name
```json
{ "template": "challenge-solution", "content": {...} }
```

Option B: By example
```json
{ "like_slide": "slide-10", "content": {...} }
```

Option C: By intent
```json
{ "intent": "three_pain_points_with_solution", "content": {...} }
```

### Q4: How do templates get created?

**Manual definition:**
- User creates a "template slide" in Figma
- User marks it somehow (naming convention? special layer?)
- Claude reads and extracts

**Automatic extraction:**
- Claude reads any slide
- Infers template structure
- Asks user to confirm

**Generation:**
- Claude generates template from scratch
- Renders in Figma
- User refines
- Claude re-extracts

### Q5: How do we handle variable content?

Template has 3 accent blocks, but content has 5 points:
- Truncate to 3? (lose content)
- Add more blocks? (need to clone styling)
- Warn user? (friction)

Template has headline + 3 bullets, content has headline + subline + 2 bullets:
- Strict matching? (reject mismatched content)
- Flexible slots? (adapt template to content)

---

## Proposed Approach

### Phase 1: Template Extraction (MVP)

**Goal:** "Make a slide like slide-10 but with this content"

1. Add `monorail_extract_template` tool
   - Input: slide ID
   - Output: template spec (frames, colors, text styles, positions)

2. Add `monorail_instantiate_template` tool
   - Input: template spec + content mapping
   - Output: new slide with same structure, new content

3. Test case:
   - Extract template from slide-10
   - Create slide-11 with SOLUTION content
   - Verify visual match

**Scope:** Single slide → single slide. No template library yet.

### Phase 2: Template Library

**Goal:** "Use my 'accent-points' template"

1. Template naming and storage
2. Multiple templates per deck
3. Template versioning (template changed, what about existing slides?)

### Phase 3: Template Generation

**Goal:** "Create a design system for this deck"

1. Claude generates design spec
2. Renders reference templates
3. Human refinement loop
4. Extract as reusable templates

---

## Open Questions for Design Session

1. **Slot identification:** How do we know which frames are "content slots" vs decoration?
   - Naming convention? (`slot:headline`, `slot:accent-block`)
   - Position heuristics? (largest text = headline)
   - User annotation?

2. **Repeatable elements:** How do we clone styling for variable-count elements?
   - Copy frame, update content?
   - Use Figma components with instances?

3. **Style fidelity:** How much do we capture?
   - Just text content? (we have this)
   - Text + colors? (medium)
   - Full styling including effects, blending, etc.? (complex)

4. **Template scope:** One template per slide, or templates that span multiple slides?
   - e.g., "Use this header on ALL slides"

5. **Figma Components:** Should templates BE Figma components?
   - Pros: Native, designers understand, built-in instancing
   - Cons: Components have constraints, harder to programmatically create?

---

## Spike Results (Session 12)

### What We Can Capture ✅

| Category | Available |
|----------|-----------|
| Frame tree | Full hierarchy, recursive |
| Fills | Solid, Gradient (with stops), Image (with hash) |
| Strokes | Color, weight, opacity |
| Corner radius | Per-frame |
| Auto Layout | layoutMode, itemSpacing, all 4 paddings |
| Text | fontFamily, fontStyle, fontSize, alignment, color |
| Effects | Shadows (radius, offset, color, spread) |

### Key Learning: Size Varies Wildly ⚠️

| Slide Type | Nodes | JSON Size |
|------------|-------|-----------|
| Simple bullets | 6 | ~2KB |
| Complex custom (slide-10) | 120 | 143KB |

**Implication:** Raw capture is too big. Need filtering/summarization.

### Design Decisions Made

1. **Diagrams → Placeholder for MVP**
   - Complex right-side diagrams (100+ nodes) omitted
   - Template captures left-side structure only
   - Can revisit diagram handling later

2. **Slot Identification Heuristics**
   - TEXT nodes at depth 1-2 → content slots
   - Named frames ("Card", "Number") → structural slots
   - Depth ≥ 3 → likely diagram, skip or mark complex

3. **Template Spec Format**
   - Compact (~5KB) not raw (~143KB)
   - Slots array with node IDs + roles
   - Style snapshots for key elements
   - `has_complex_region` flag + bounds

## Implementation Status

| Tool | Status | Notes |
|------|--------|-------|
| `monorail_capture_template` | ✅ Done | Full node tree with all styling |
| `monorail_extract_template` | ✅ Done | 143KB → 6KB, slot identification |
| `monorail_instantiate_template` | ✅ Done | Clone + update text |
| `monorail_extract_design_system` | ✅ Done | Colors, fonts, spacing tokens |
| `monorail_create_styled_slide` | ✅ Done | Generate quote/bullets/big-idea/section |

## Next Steps

### Polish (Priority 1)
- Font fallback chain for unavailable fonts
- Role-based content mapping (not node IDs)
- Smarter accent color selection

### Future Work (Not Yet)
- Diagram editing (text works, images/structure don't)
- Full Figma visual language
- Component instances

---

## Spike Results (Session 13): Extraction Testing

### Test: slide-10 (CHALLENGE+SOLUTION)

| Metric | Value |
|--------|-------|
| Raw capture | 57,332 bytes (120 nodes) |
| Extracted template | 6,121 bytes (9 slots) |
| Size reduction | 89.3% |

### Slots Correctly Identified ✅

| Role | Content | Why it worked |
|------|---------|---------------|
| `headline` | "Traditional access is static..." | fontSize ≥ 48, y < 500 |
| `card_title` × 3 | Pain point text in cards | Parent name = "Card" |
| `repeatable_card` × 3 | Card frames | Name contains "Card" |
| `layout_container` | Section label border | Has Auto Layout |

### Refinements Needed 🔧

1. **Section label misclassified as `body_text`**
   - Problem: "challenge+solution" is at depth 2 inside "Number" frame
   - Current heuristic uses local y position (12px) not absolute (157px)
   - Fix: Calculate absolute Y by summing parent offsets, OR check parent name patterns

2. **Absolute position tracking**
   - Current: Only tracks local x/y within parent
   - Need: Track absolute slide position for position-based heuristics
   - Implementation: Pass cumulative offset through tree walk

3. **Font/style-based classification**
   - "Supply" font family often indicates labels/section headers
   - Could add font family as a classification signal
   - Bright accent colors (like the lime green) also indicate labels

4. **Named slot patterns**
   - "Number" frame contains section label → could infer role from parent name
   - Add pattern: parent name "Number" or "Label" → `section_label`

### Complex Regions Correctly Filtered ✅

The right-side diagram (41 nodes in "Frame 425") was correctly filtered to just bounds.
This is exactly the behavior we want — preserve position for layout, skip content details.

---

## Spike Results (Session 13): Design System + New Layouts

### Design System Extraction

From slide-10/13, extracted:

**Colors:**
| Hex | Name | Usage |
|-----|------|-------|
| `#111111` | dark | Background, cards |
| `#ffffff` | light | Headlines, body text |
| `#cdff3e` | accent-green | Section labels, borders |
| `#8a38f5` | accent-blue | Diagram elements |
| `#e03e1a` | accent-red | Diagram warnings |

**Fonts:**
| Family | Style | Sizes | Usage |
|--------|-------|-------|-------|
| PP Supply Mono | Regular | 48px | Headlines |
| Supply | Regular | 24px | Section labels |
| Geist | Regular | 22px | Card content |
| Inter | Regular | ~15px | Small text |

**Spacing:**
- Card padding: ~15px
- Item spacing: ~9px
- Slide margin: 60px
- Card radius: 8px

### New Layout Generation

Successfully created "quote" slide using extracted tokens:
- ✅ Dark background applied
- ✅ White text for quote
- ⚠️ Attribution used red accent (should prefer lime)
- ✅ Centered layout

### Diagram Editing Gap

| Task | Status | Path Forward |
|------|--------|--------------|
| Edit diagram text | ✅ Works | Use `monorail_patch_elements` with element IDs |
| Swap images/logos | ❌ Not yet | Would need image upload + `setImageFill()` |
| Add/remove elements | ❌ Not yet | Would need full structure access |
| Reposition elements | ❌ Not yet | Currently filtered out |

**Decision:** Focus on text + layout base case first. Diagrams are future work.
