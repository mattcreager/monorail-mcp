# Keycard Deck Template

A reusable structure for Keycard sales/reconnect decks. Based on patterns from JPM/RBC work.

## Deck Structure

```
┌─────────────────────────────────────────────────────────────┐
│  SETUP                                                       │
├─────────────────────────────────────────────────────────────┤
│  1. Opener / Context                                        │
│     - Section header or title                               │
│     - "Since we last met" / "Where we are"                  │
│                                                             │
│  2. What's Changed + Problems Solved (two-column)           │
│     LEFT: Progress signals (production, pilots, partners)   │
│     RIGHT: Technical wins (permissions, access, visibility) │
│     FOOTERS: Insight summaries                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  TURN (the money slide)                                     │
├─────────────────────────────────────────────────────────────┤
│  3. Our Thesis / How We Think About X                       │
│     - Badge with core positioning                           │
│     - 4 principles/pillars                                  │
│     - Footer with "mirrors mature systems" framing          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  LANDING                                                    │
├─────────────────────────────────────────────────────────────┤
│  4. Why This Matters Now (Interfaces/Context)               │
│     - Why control at creation time                          │
│     - Why this is urgent for them                           │
│                                                             │
│  5. Discovery / Explore Together                            │
│     - 3 questions max                                       │
│     - Invite co-creation                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Slide Templates (Primitives)

### Two-Column Progress Slide

Use for: "What's Changed" + "Problems Solved" combined

```
Layout:
- Two cards side by side (880px each, 40px gap)
- Each card: headline, subhead, 3 bullets, footer insight
- Dark background (#1a1a2e), cards (#1e293b)
- Green bullet markers (#10b981)
- Footer in darker box (#0f172a)

Content pattern:
LEFT                              RIGHT
────────────────────────          ────────────────────────
What's Changed                    Problems We've Solved
From X to Y                       Validated in production

• Progress signal 1               • Technical win 1
• Progress signal 2               • Technical win 2  
• Progress signal 3               • Technical win 3

[Insight about constraints]       [Insight about old approach]
```

### Thesis Slide (Money Slide)

Use for: The turn — your core positioning

```
Layout:
- Large headline (48px)
- Green badge with thesis statement (#065f46 bg, #a7f3d0 text)
- Card with 4 principles (green dot bullets)
- Footer with "mirrors mature systems" framing

Content pattern:
────────────────────────────────────────
Our Current Thesis on [X]

[Agents should be treated like infrastructure, not assistants]

┌──────────────────────────────────────┐
│ • Principle 1                        │
│ • Principle 2                        │
│ • Principle 3                        │
│ • Principle 4                        │
└──────────────────────────────────────┘

[This mirrors how mature systems handle Y, not Z.]
```

### Discovery Slide

Use for: Closing — invite collaboration

```
Layout:
- Standard bullets archetype
- 3 questions max
- Questions should surface THEIR learnings

Content pattern:
────────────────────────────────────────
What We'd Love to Explore Together

• What have you learned from [their experiments]?
• Where did [blocker type] block progress?
• What does "[their goal]" actually mean internally?
```

---

## Narrative Checklist

Before presenting:

- [ ] Can you point to the TURN slide?
- [ ] Does the hallway sentence appear on a slide?
- [ ] Are you leading with production reality, not vision?
- [ ] Do you show scars, not just roadmap?
- [ ] Is the discovery slide inviting co-creation?

### Hallway Sentence Template

> "They've already made the mistakes we're about to make, and they're building the missing layer we don't have time to build ourselves."

Adapt this to your specific context.

---

## What Enterprise Buyers Actually Want Answered

(Subtext they won't say out loud)

1. **Are you real now?**
   - Production usage
   - Non-trivial customers
   - Things breaking and being fixed

2. **Is this safe to bet my career on?**
   - Control, auditability, access, blast radius
   - Clear stance on agents doing vs being allowed to do

3. **Are you ahead of where we are internally?**
   - Especially on agent governance + dev experience
   - They don't want toys; they want leverage

4. **Can I shape this with you?**
   - Banks love co-creation when framed safely

---

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Lead with vision | Lead with production reality |
| "We're building X" | "We shipped X, here's what broke" |
| Technical feature focus | Business outcome focus |
| "10x productivity" | "3000 devs, 30% more productive" |
| Vague next steps | Specific discovery questions |
| Multiple asks | One clear invitation |

---

## Monorail Implementation Notes

### Building with Primitives

The two-column and thesis slides work best with `monorail_primitives` because:
- Precise positioning control
- Custom color schemes (green badges, dark cards)
- Mixed element types (rect + text + lines)
- Footer insight boxes

### Slide Sequence

```javascript
// Typical IR structure for a Keycard reconnect deck
{
  "slides": [
    { "archetype": "section", "content": { "headline": "Context Header" }},
    { "archetype": "primitives", /* two-column progress */ },
    { "archetype": "primitives", /* thesis / money slide */ },
    { "archetype": "bullets", /* interfaces / why now */ },
    { "archetype": "bullets", /* discovery questions */ }
  ]
}
```

---

## Related

- `docs/SKILL.md` — Narrative toolkit
- `docs/discovery/sales-deck-patterns.md` — Full pattern catalog
- `sales-deck/andrew-advice.md` — Andrew Lloyd session transcript
