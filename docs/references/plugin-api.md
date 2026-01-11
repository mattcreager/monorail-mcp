# Figma Plugin API Quick Reference

> Discovered in Session 10. The gap is USAGE, not capability.

## Auto Layout

```typescript
frame.layoutMode = 'VERTICAL' | 'HORIZONTAL';
frame.primaryAxisSizingMode = 'AUTO';
frame.counterAxisSizingMode = 'AUTO';
frame.paddingTop = frame.paddingBottom = 10;
frame.itemSpacing = 24;
```

## Styled Rectangles

```typescript
rect.cornerRadius = 8;  // or individual: topLeftRadius, etc.
rect.fills = [{ type: 'SOLID', color: {...} }];
rect.strokes = [{ type: 'SOLID', color: {...} }];
rect.strokeWeight = 2;
```

## Gradient Fills

```typescript
rect.fills = [{
  type: 'GRADIENT_LINEAR',
  gradientStops: [
    { position: 0, color: { r: 0.06, g: 0.06, b: 0.1, a: 1 } },
    { position: 1, color: { r: 0.1, g: 0.1, b: 0.18, a: 1 } }
  ],
  gradientTransform: [[1, 0, 0], [0, 1, 0]]
}];
```

## Lines with Arrows

```typescript
const line = figma.createLine();
line.strokeCap = 'ARROW_LINES';  // adds arrowheads
```

## SVG Import

```typescript
const node = figma.createNodeFromSvg('<svg>...</svg>');
```

## Read Local Styles

```typescript
const paintStyles = await figma.getLocalPaintStylesAsync();
const textStyles = await figma.getLocalTextStylesAsync();
```

## Figma Slides Specifics

- Use `figma.createSlide()` not `figma.createFrame()` for actual slides
- Set `slide.fills = [{ type: 'SOLID', color }]` for backgrounds
- With `documentAccess: dynamic-page`, use `getNodeByIdAsync()` not `getNodeById()`
- Slide structure: Page → SLIDE_GRID → SLIDE_ROW → SLIDE (recursive traversal needed)

## What We're Using

| Feature | Status |
|---------|--------|
| Auto Layout | ✅ `bullets` archetype |
| Gradients | ✅ `title` archetype |
| Rounded corners | ❌ Not yet |
| Lines + arrows | ❌ Not yet |
| SVG import | ❌ Not yet |
| Component instances | ❌ Not yet |
| Read local styles | ❌ Not yet |
