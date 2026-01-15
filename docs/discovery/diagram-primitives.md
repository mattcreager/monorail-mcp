# Discovery: Diagram Primitives (Higher-Level Abstractions)

## Status: Discovery

Session 32 added powerful low-level primitives (`path`, `smooth`, `closed`, gradient backgrounds, arrow caps). But using them for common slide patterns requires manual coordinate math that's tedious and error-prone.

---

## The Problem

We built a hockey-stick curve for a timeline slide:

```json
{
  "op": "path",
  "points": [{"x": 0, "y": 0}, {"x": 300, "y": -10}, {"x": 600, "y": -20}, ...],
  "smooth": true,
  "endCap": "ARROW_EQUILATERAL"
}
```

Then tried to place dots at each stage:

```json
{"op": "ellipse", "x": 75, "y": 355, ...}
{"op": "ellipse", "x": 375, "y": 345, ...}
```

**Result:** Dots were "miles off" from the curve. Getting coordinates right requires:
1. Understanding bezier math
2. Calculating points along the curve
3. Manual trial-and-error positioning

This is too low-level for practical use.

---

## What's Missing

### 1. Point-on-curve calculation
If you define a path, you should be able to say "place a dot at 25% along this path" and have it land exactly on the curve.

### 2. Named curve shapes
Common curves like "j-curve", "hockey-stick", "s-curve" should be pre-defined with:
- The right shape (actually exponential, not linear)
- Anchor points at meaningful positions (start, inflection, end)

### 3. Timeline abstraction
A timeline shouldn't require manual x/y for each stage:

```json
{
  "op": "timeline",
  "curve": "hockey-stick",  // or "flat", "wave", "j-curve"
  "stages": [
    { "label": "This Week", "description": "What's blocking?" },
    { "label": "Then", "description": "Unblock Chime" },
    { "label": "Result", "description": "Demo lands" }
  ]
}
```

The operation would:
- Draw the curve
- Place dots at evenly-spaced positions ON the curve
- Position labels below each dot
- Handle all the coordinate math internally

---

## Possible Solutions

### Option A: Curve helpers in primitives
Add a way to reference positions on a previously-created path:

```json
{"op": "path", "name": "flow", "points": [...], "smooth": true},
{"op": "ellipse", "onPath": "flow", "at": 0.0},    // start
{"op": "ellipse", "onPath": "flow", "at": 0.33},   // 1/3 along
{"op": "ellipse", "onPath": "flow", "at": 0.66},   // 2/3 along
{"op": "ellipse", "onPath": "flow", "at": 1.0}     // end
```

**Pros:** Flexible, works with any path
**Cons:** Still requires understanding curve positioning

### Option B: Higher-level diagram ops
New operations for common patterns:

```json
{"op": "timeline", "curve": "hockey-stick", "stages": [...]}
{"op": "flowchart", "nodes": [...], "connections": [...]}
{"op": "funnel", "stages": [...]}
{"op": "cycle", "nodes": [...]}  // already exists for archetypes
```

**Pros:** Easy to use, handles all math
**Cons:** More code to maintain, less flexible

### Option C: Template-based approach
Capture well-designed diagrams from Figma, clone with new content:

```
1. Design a hockey-stick timeline manually in Figma
2. Capture it as a template
3. Clone with different stage labels
```

**Pros:** Perfect fidelity, leverages Figma's design tools
**Cons:** Need templates for each variation

---

## Recommendation

**Short-term:** Use capture/clone for diagram slides. Design once in Figma, reuse via `monorail_clone`.

**Medium-term:** Add Option A (curve helpers) — `onPath` + `at` for positioning elements along paths.

**Long-term:** Consider Option B (diagram ops) if specific patterns come up repeatedly in dogfood.

---

## Open Questions

1. How often do we need curved timelines vs straight ones?
2. What diagram types come up most in real decks?
3. Is the math complexity worth solving in code, or should we lean on Figma's UI for diagram design?

---

## Related

- `docs/discovery/background-fills.md` — image backgrounds (also deferred)
- Existing `cycle` diagram in archetypes — native Figma shapes, works well
- `monorail_clone` — the template approach already works for complex layouts
