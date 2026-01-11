# Decision: Auto Layout Consistency

> Date: 2026-01-11 — Session 17 review

## Context

During a plan review, we noticed inconsistent use of Auto Layout across archetypes:

| Archetype | Current | Layout Method |
|-----------|---------|---------------|
| big-idea | ✅ | Auto Layout container |
| bullets | ✅ | Auto Layout container |
| title | ❌ | Fixed Y positions |
| quote | ❌ | Fixed Y positions |
| summary | ❌ | Fixed Y positions |
| section | ❌ | Fixed Y positions |

The fixed-position archetypes use hardcoded Y values like:
```typescript
// title
if (c.headline) await addText(parent, c.headline, 200, 420, 96, ...);
if (c.subline) await addText(parent, c.subline, 200, 550, 36, ...);
```

## Problem

Fixed positions violate Figma design best practices:

1. **Brittle** — Changing font size, line height, or content length breaks the layout
2. **Anti-pattern** — Figma's guidance is Auto Layout for almost everything
3. **Inconsistent** — Some archetypes use Auto Layout, others don't
4. **User-hostile** — Fixed positions fight manual adjustments in Figma

## Decision

**Use Auto Layout containers for ALL archetypes with stacked content.**

Each archetype should wrap its content in a named container:
- `title-container` (headline + subline)
- `quote-container` (quote + attribution)
- `summary-container` (headline + items)
- `section-container` (headline only, but still wrapped for consistency)

## Benefits

1. **Responsive** — Content reflows naturally when text wraps
2. **Consistent** — Same pattern everywhere, easier to maintain
3. **Detection** — Round-trip archetype detection already looks for `*-container` frames
4. **Template capture** — Auto Layout properties get captured and preserved
5. **User editable** — Users can adjust spacing in Figma's native controls

## Implementation

Use the existing `createAutoLayoutFrame()` and `addAutoLayoutText()` helpers:

```typescript
case 'title':
  {
    // Gradient background (unchanged)
    ...
    
    // Auto Layout container for text
    const titleContainer = createAutoLayoutFrame(
      parent,
      'title-container',
      200,
      400,  // vertical center area
      'VERTICAL',
      20    // spacing between headline and subline
    );
    if (c.headline) await addAutoLayoutText(titleContainer, c.headline, 96, true, COLORS.headline, 1520, 'headline');
    if (c.subline) await addAutoLayoutText(titleContainer, c.subline, 36, false, COLORS.muted, 1520, 'subline');
  }
  break;
```

## Trade-offs

- Slightly more complex code (container creation)
- Need to update archetype detection to recognize new container names

Both are minor compared to the benefits.

## Status

**Planned** — To be implemented as Priority 1 item.
