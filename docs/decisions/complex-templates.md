# Decision: Complex Template Strategy

**Date**: 2026-01-11  
**Status**: Decided  
**Context**: How to handle slides as complex as the Keycard example (3-column cards, badges, feature rows)

## The Question

The Keycard slide has:
- Eyebrow label (cyan, small caps)
- Mixed-color headline (partial cyan styling)
- Three cards with: label, title, body, colored badge
- Feature row with icons + labels + descriptions

Our existing archetypes only supported simple layouts (title, bullets, two-column, etc.).

## Options Considered

### Option 1: Extend IR + Add New Archetypes
Add complex archetypes like `position-cards` that render rich layouts programmatically.

**Pros**: Full control, reproducible, can generate variants  
**Cons**: More code to maintain, each new layout needs implementation

### Option 2: Capture/Clone Only
Rely entirely on capturing existing slides and cloning with text swaps.

**Pros**: Zero new code for layouts  
**Cons**: Limited to what capture can identify (MAX_DEPTH=2), can't change structure

### Option 3: Hybrid Approach
Use archetypes for common patterns, capture/clone for one-off complex slides.

**Pros**: Best of both worlds  
**Cons**: Two mental models

## Decision

**Hybrid approach with bias toward archetypes for repeatable patterns.**

### Implemented: `position-cards` Archetype

```json
{
  "archetype": "position-cards",
  "content": {
    "eyebrow": "OUR POSITION",
    "headline": "Identity is the pillar. ACP is north.",
    "subline": "The wedge shows us what's next.",
    "cards": [
      {
        "label": "THE FOUNDATION",
        "title": "Identity",
        "body": "Description text here.",
        "badge": "✓ Built",
        "badge_color": "green"
      }
      // ... up to 3 cards
    ],
    "features": [
      { "label": "Hooks", "description": "block/allow at runtime" }
      // ... multiple features
    ]
  }
}
```

### What Works

| Feature | Archetype | Capture/Clone |
|---------|-----------|---------------|
| Eyebrow labels | ✅ | ✅ |
| Headlines | ✅ | ✅ |
| Multi-column cards | ✅ | ⚠️ depth limits |
| Badges/pills | ✅ | ❌ too nested |
| Feature rows | ✅ | ⚠️ depth limits |
| **Mixed-color text** | ❌ | ❌ |

### Known Limitations

1. **Mixed-color headlines**: Single text nodes can have character-level styling in Figma, but we can't programmatically set different colors within one text node without complex range-based styling. For now, keep headlines single-color.

2. **Capture depth**: `MAX_SLOT_DEPTH = 2` means deeply nested content (badges inside cards inside containers) becomes "complex regions" that can't be updated via clone.

3. **Structure changes**: Clone preserves structure exactly. Can't add/remove cards.

## When to Use Each Approach

| Scenario | Approach |
|----------|----------|
| Repeatable pattern (will use 5+ times) | Add archetype |
| One-off complex slide | Build in Figma, use capture/clone |
| Slight text variations | Use clone |
| Different card count | Different archetype or rebuild |

## Future Improvements

1. **Increase MAX_SLOT_DEPTH to 3** — Would capture more nested content
2. **Rich text support** — Character-level styling for mixed colors
3. **Component instances** — Use Figma components instead of raw shapes
4. **Three-column archetype** — Simpler version without badges

## Outcome

Successfully rendered a Keycard-style slide with:
- ✅ Cyan eyebrow
- ✅ Two-line headline  
- ✅ Three cards with labels, titles, bodies
- ✅ Highlighted middle card (cyan border)
- ✅ Colored badges (green/cyan/orange)
- ✅ Feature row with orange dots

The `position-cards` archetype proves complex layouts are achievable. The pattern can be extended for other complex slide types as needed.
