# Discovery: Clone with Design System Remap

> **Status:** Not started  
> **Problem:** When cloning slides, exact colors are copied — but we want the *color distribution* with a different palette.

---

## The Problem

When you clone a slide from Deck A (e.g., ACP/Keycard with cyan/orange/purple accents) into Deck B (e.g., Monorail with its own theme), you get:

✅ Layout structure preserved  
✅ Font styling preserved  
✅ Spacing/positioning preserved  
❌ **Colors are from Deck A, not Deck B**

The slide looks "off-brand" even though the structure is perfect.

---

## What We Actually Want

Preserve the **color roles**, not the exact colors:

| Role | Source (ACP) | Target (Monorail) |
|------|--------------|-------------------|
| Background | `#111111` | `#0f0f1a` |
| Accent 1 | `#cdff3e` (lime) | `#00bdd6` (cyan) |
| Accent 2 | `#f57623` (orange) | `#f28c26` (orange) |
| Muted | `#9baca9` | `#9ca3b0` |
| Text | `#ffffff` | `#fafafa` |

The clone should map colors by role, not copy them literally.

---

## Possible Approaches

### A. Role-Based Color Mapping

1. During capture, classify each color by role (bg, accent, muted, text)
2. During clone, accept a target design system
3. Map source colors → target colors by role

**Pros:** Clean, semantic  
**Cons:** Role classification is heuristic (what makes something "accent"?)

### B. Explicit Color Map Parameter

```json
{
  "source_slide_id": "8:359",
  "content_map": { ... },
  "color_map": {
    "#cdff3e": "#00bdd6",
    "#f57623": "#f28c26"
  }
}
```

**Pros:** Explicit, no guessing  
**Cons:** User has to figure out the mapping

### C. Design System Reference

1. Capture design system from target deck (or define one)
2. Clone with `target_design_system_id` or inline tokens
3. Plugin does role inference + remapping

**Pros:** Reusable, DRY  
**Cons:** More complex, needs design system storage

### D. Two-Step: Clone Then Restyle

1. Clone as-is (current behavior)
2. New tool `monorail_restyle` applies a design system to an existing slide

**Pros:** Composable, each tool does one thing  
**Cons:** Two operations instead of one

---

## Questions to Answer

1. **Can we reliably classify color roles?** (usage patterns: fills vs strokes vs text)
2. **Should this be clone-time or post-clone?** (D might be simpler)
3. **How do we define "Monorail's design system"?** (capture from a reference slide? hardcode?)
4. **What about gradients?** (need to remap gradient stops too)

---

## Next Steps

- [ ] Spike: Analyze captured color data — can we infer roles from usage?
- [ ] Spike: Try approach D (clone + restyle) — see if it feels natural
- [ ] Decide: Inline during clone vs separate restyle tool
