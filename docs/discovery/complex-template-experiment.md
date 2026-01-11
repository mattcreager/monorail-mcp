# Complex Template Experiment

**Goal**: Determine if capture/clone can handle slides as complex as the Keycard example.

## The Keycard Reference

```
┌────────────────────────────────────────────────────────────────────┐
│  OUR POSITION (cyan, small caps)                                   │
│                                                                    │
│  Identity is the pillar. ACP is north.   (mixed: white + cyan)    │
│  The wedge shows us what's next.         (white)                  │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ THE FOUNDATION│  │ THE DIRECTION│  │ THE OPTIM... │             │
│  │ Identity     │  │ Agent Control│  │ Wedge + Cust │             │
│  │ Who, on whose│  │ Discovery,   │  │ Coding agents│             │
│  │ behalf...    │  │ access...    │  │ tell us...   │             │
│  │ ✓ Built      │  │ North Star   │  │ Our Guide    │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  ● Hooks  ● MCP Config  ● Policy  ● Telemetry              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Challenges

1. **Mixed-color headline**: Single text node with character-level color styling
2. **Three-column cards**: Nested structure (label → title → body → badge)
3. **Badges/pills**: Small colored rectangles with text inside
4. **Feature row**: Icons + labels with descriptions

## Experiment: Simplified Test Slide

### Phase 1: Build in Figma

Create a simplified version:

```
┌────────────────────────────────────────────────────────────────────┐
│  SECTION LABEL (cyan, small caps)                                  │
│                                                                    │
│  Main Headline Goes Here (white, single color)                    │
│  Supporting subline with context. (muted)                         │
│                                                                    │
│  ┌────────────────────┐  ┌────────────────────┐                   │
│  │ CARD LABEL         │  │ CARD LABEL         │                   │
│  │ Card Title         │  │ Card Title         │                   │
│  │ Card body text     │  │ Card body text     │                   │
│  │ goes here.         │  │ goes here.         │                   │
│  └────────────────────┘  └────────────────────┘                   │
└────────────────────────────────────────────────────────────────────┘
```

**Frame naming for clarity:**
- `section-label`
- `headline`
- `subline`
- `cards-container` (Auto Layout, horizontal)
  - `card-1` (Auto Layout, vertical, padding 24)
    - `card-1-label`
    - `card-1-title`
    - `card-1-body`
  - `card-2` (same structure)

### Phase 2: Capture

Run via Claude/MCP:
```
monorail_capture
```

**What to look for:**
1. `slots` array — are card internals included?
2. `complex_regions` — what got filtered out?
3. `design_system.colors` — did it pick up cyan/muted/white?
4. `stats.slots_identified` vs `stats.total_nodes_captured`

### Phase 3: Clone with New Content

Get slot IDs from capture, then:
```
monorail_clone
  source_slide_id: <slide_id>
  content_map:
    <section_label_id>: "THE DIRECTION"
    <headline_id>: "New Headline Text"
    <card_1_label_id>: "FEATURE ONE"
    <card_1_title_id>: "First Feature"
    <card_1_body_id>: "Description of the first feature and what it does."
    <card_2_label_id>: "FEATURE TWO"
    <card_2_title_id>: "Second Feature"
    <card_2_body_id>: "Description of the second feature."
```

### Phase 4: Analyze Results

Record:
- [ ] Which text nodes updated successfully?
- [ ] Which failed (font unavailable, depth too deep)?
- [ ] Is the new slide visually identical structure?
- [ ] What couldn't be changed?

---

## Hypothesis

**Prediction**: Capture/clone will work for simple card structures IF:
1. Text nodes are at depth ≤2 (Auto Layout doesn't add invisible wrapper frames)
2. All fonts used are available (or in fallback chain)
3. We don't need to change inline styling (colors within a single text node)

**Known limitations**:
- Mixed-color headlines must stay fixed in the template
- Adding/removing cards requires a different template
- Badges with icons need separate handling

---

## Decision Framework

After the experiment, decide:

| Pattern | Approach |
|---------|----------|
| Simple 2-3 column layouts | Add `three-column` archetype |
| Fixed styling variations | Use capture/clone from styled templates |
| Mixed-color headlines | Template-only (can't programmatically change) |
| Cards with badges | Template-only OR extend IR significantly |
| Feature rows with icons | Template-only for now |

---

## Next Steps

1. **Today**: Build simplified slide in Figma, run capture
2. **Analysis**: Document what capture returns
3. **Decision**: Write up strategy in `decisions/complex-templates.md`
