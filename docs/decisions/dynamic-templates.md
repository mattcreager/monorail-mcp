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

## Next Steps

1. **Design session:** Walk through Use Case 1 end-to-end
   - What exactly happens when user says "make SOLUTION slide like slide-10"?
   - What data do we need to capture from slide-10?
   - How do we render slide-11?

2. **Spike:** Can we read full frame structure (not just text) from Figma plugin?
   - Frames, positions, sizes
   - Fill colors, stroke colors
   - Font styles, weights, sizes

3. **Decision:** Template storage approach (Figma-native vs JSON vs hybrid)
