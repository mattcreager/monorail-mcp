# Discovery: Shape Position Capture

> **Status:** Not started  
> **Problem:** `monorail_capture` extracts colors from shapes but not positions, limiting the "learn from user edits" workflow.

---

## The Problem

When iterating on visual elements (play buttons, diagram nodes, icons), the ideal workflow is:

1. AI renders something with initial position
2. User manually adjusts it in Figma to look right
3. AI captures user's adjustment
4. AI updates archetype code with correct values

**What actually happens:**

- `monorail_capture` returns shape nodes (ELLIPSE, POLYGON, RECTANGLE)
- It extracts their **fills/colors** (useful for design system capture)
- It does NOT extract **x, y, width, height, rotation**
- AI can't programmatically learn where user moved things

**Session 25 example:**
```
AI: Renders play triangle at x=598
User: "It's still off to the left"
User: *manually adjusts in Figma to x=600*
AI: *tries monorail_capture* → gets colors, no position
User: *reads coordinates from Figma panel, tells AI*
AI: Updates code to x=600
```

The manual step breaks the flow.

---

## What We'd Want

Extend capture output to include shape geometry:

```json
{
  "slots": [...],  // existing text/frame slots
  "shapes": [
    {
      "name": "play-circle",
      "type": "ELLIPSE",
      "x": 550,
      "y": 287,
      "width": 100,
      "height": 100,
      "fills": [{ "type": "SOLID", "color": "#e5e5e5" }]
    },
    {
      "name": "play-triangle",
      "type": "POLYGON",
      "x": 600,
      "y": 320,
      "width": 36,
      "height": 36,
      "rotation": -90,
      "fills": [{ "type": "SOLID", "color": "#1a1a26" }]
    }
  ]
}
```

This would let AI:
- See exactly where user positioned elements
- Copy those values into archetype code
- Verify changes after re-render

---

## Use Cases

### 1. Archetype Tuning (Session 25)
AI renders archetype → user tweaks visual element → AI learns correct positions

### 2. Diagram Capture
User manually creates a diagram → AI captures all shapes → can recreate or clone it

### 3. Visual Regression
AI captures shape positions → makes changes → re-captures → compares positions to detect drift

### 4. Clone Enhancement
Combined with design system remap, could clone entire visual layouts not just text

---

## Implementation Options

### A. Extend `monorail_capture` Response

Add `shapes` array alongside existing `slots`:

```typescript
// In extractTemplate function
if (node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'RECTANGLE') {
  shapes.push({
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    fills: extractFills(node)
  });
}
```

**Pros:** Single tool, consistent with current pattern  
**Cons:** May bloat response for complex slides

### B. New `monorail_capture_shapes` Tool

Dedicated tool for shape capture, takes `slide_id` and optional `shape_names` filter:

```json
{
  "slide_id": "5:766",
  "shape_names": ["play-circle", "play-triangle"]
}
```

**Pros:** Focused, doesn't bloat main capture  
**Cons:** Another tool to learn

### C. Add Flag to Existing Capture

```json
{
  "slide_id": "5:766",
  "max_depth": 6,
  "include_shapes": true
}
```

**Pros:** Opt-in, backward compatible  
**Cons:** Another parameter to remember

---

## Questions to Answer

1. **Which shapes matter?** All shapes? Only named ones? Only in certain containers?
2. **Coordinate system?** Relative to slide frame or absolute canvas?
3. **Nested shapes?** Shapes inside groups/frames — flatten or preserve hierarchy?
4. **Performance?** Complex diagrams might have 50+ shapes — is that a problem?

---

## Relationship to Shape Round-Tripping

This is **capture-side** of a bigger feature:

| Feature | Direction | Status |
|---------|-----------|--------|
| Shape position capture | Figma → IR | This doc |
| Shape round-tripping | IR → Figma → IR | Separate discovery |

Shape round-tripping needs this as a prerequisite — can't round-trip what you can't capture.

---

## Next Steps

- [ ] Spike: Add shape extraction to `extractTemplate` with `include_shapes` flag
- [ ] Test: Capture video slide, verify play button positions come through
- [ ] Decide: Extend existing tool vs new tool
- [ ] Consider: What subset of shape properties is useful (fills, strokes, effects, constraints?)
