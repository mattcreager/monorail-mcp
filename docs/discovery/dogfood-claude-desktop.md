# Dogfooding Report: Claude Desktop Session

> Session date: January 11, 2026  
> Participants: Matthew (human), Claude (AI)  
> Duration: ~45 minutes  
> Goal: Test the full loop — narrative development → IR generation → Figma rendering → human edits → AI adaptation

---

## Executive Summary

The core loop works. We went from a messy 11-slide deck to a tight 8-slide narrative structure, collaborating in real-time between Claude and Figma. The narrative toolkit provided useful scaffolding. However, we hit clear limits around visual complexity that reveal where the current archetype system breaks down.

---

## What We Did

### Phase 1: Narrative Analysis
- Started with an existing 11-slide deck (JSON/IR provided in chat)
- Applied the narrative toolkit: Hallway Test, Spine Check, Beat Analysis
- Identified structural problems:
  - CTA in slot 2 (should be at end)
  - Missing stakes before the turn
  - Simpsons quote with no argumentative job
  - "8 tools" / "6 tools" inconsistency
  - Turn buried after mechanism details

### Phase 2: Restructure
- Developed new 8-beat structure:
  1. Open → 2. Problem → 3. Dead end (demo) → 4. Turn → 5. Mechanism → 6. Loop → 7. Payoff → 8. Landing
- Generated IR for all 8 slides
- Pushed to Figma via `monorail_push`

### Phase 3: Cleanup
- Discovered push *appends* rather than replaces — ended up with 19 slides
- Used `monorail_delete` to remove old 11 slides
- Confirmed clean 8-slide state via `monorail_pull`

### Phase 4: Human Spikes
- Matthew edited slides 3 and 7 directly in Figma
- Slide 3: Added static HTML embed (for "loop exited" demo moment)
- Slide 7: Added Simpsons Monorail video (https://youtu.be/v4z_9NcIJXI)
- Both appeared as `archetype: "unknown"` on next pull — correct behavior

### Phase 5: Complex Slide Challenge
- Matthew shared a Keycard strategy slide (complex visual layout)
- This slide exceeds current archetype capabilities significantly
- Reveals the gap between "structured text slides" and "designed visual slides"

---

## What Worked Well

### 1. The Bidirectional Loop
Pull → edit in Figma → pull again → see changes. This is the core promise and it delivers. Claude can see what the human changed and adapt.

### 2. Narrative Toolkit as Scaffolding
The Hallway Test, Spine analysis, and Beat structure kept the conversation focused on *argument* rather than just *slides*. We weren't formatting — we were thinking.

### 3. Tool Reliability
All MCP tools functioned as expected:
- `monorail_status` — confirmed connection
- `monorail_pull` — accurate deck state
- `monorail_push` — slides rendered correctly
- `monorail_delete` — clean removal
- `monorail_capture` — detected custom content

### 4. Archetype Constraints
The word limits (headline ≤8 words, bullets ≤3, etc.) forced clarity. When content overflowed, it was a signal to edit — not a reason to loosen constraints.

### 5. Human Spikes as Signal
When Matthew spiked slides 3 and 7, they appeared as `archetype: "unknown"`. This is correct — the system recognized "this is custom, don't touch it." The human's edits were preserved.

---

## Issues & Constraints Encountered

### Issue 1: Push Appends, Doesn't Replace ⚠️ HIGH
**What happened:** Pushing 8 new slides resulted in 19 total slides (11 old + 8 new).  
**Expected:** Option to replace deck or insert at position.  
**Workaround:** Manual delete of old slides.  
**Recommendation:** Add `mode: "replace" | "append" | "insert"` parameter to push.

### Issue 2: No Inline Styling in IR
**What happened:** Keycard slide has "ACP is north." in cyan within a white headline.  
**Current IR:** Only supports plain text strings.  
**Impact:** Can't generate slides with mixed-color or mixed-weight text.  
**Recommendation:** Consider markdown-ish syntax or accept as out-of-scope (human designs, AI clones).

### Issue 3: Limited Layout Archetypes
**What happened:** Keycard slide has three cards in a row.  
**Current archetypes:** Only `two-column` exists.  
**Impact:** Complex layouts require human design.  
**Recommendation:** Add `three-column` or generic `card-row` archetype.

### Issue 4: No Nested Components
**What happened:** Each Keycard card has: label → title → body → badge. That's 4 levels of hierarchy.  
**Current IR:** Flat content fields per archetype.  
**Impact:** Can't express card internals programmatically.  
**Recommendation:** Treat complex cards as "capture once, clone many" templates.

### Issue 5: Capture Returns Minimal Data for Images/Embeds
**What happened:** Captured slide 3 (static HTML image) returned `slots: []`.  
**Expected:** Reasonable — it's a raster image, not text slots.  
**Implication:** Image-based slides are opaque to the AI. Can see they exist, can't edit them.

### Issue 6: No Video/Embed Archetype
**What happened:** Simpsons video required manual Figma embed.  
**Current archetypes:** No `video` or `embed` type.  
**Recommendation:** Add `video` archetype with `url` field, or document capture/clone for custom embeds.

---

## The Keycard Slide: A Stress Test

The Keycard strategy slide represents the ceiling of what the current system cannot do natively:

| Element | Current Support | Gap |
|---------|-----------------|-----|
| Section label ("OUR POSITION") | ❌ | No "eyebrow" text in archetypes |
| Mixed-color headline | ❌ | No inline styling |
| Three-card layout | ❌ | Only two-column exists |
| Card structure (label/title/body/badge) | ❌ | No nested components |
| Status badges (✓ Built, North Star) | ❌ | No pill/badge primitives |
| Feature row with icons | ❌ | No horizontal feature list |
| Dark theme with accent colors | ⚠️ | Depends on Figma component library |

### Recommended Approach
**Path A (pragmatic):** Human designs this slide in Figma. AI captures it. Future "position" slides clone from this template with text swaps.

**Path B (ambitious):** Extend IR significantly with eyebrow fields, inline styling, card-row archetype, badge components, feature-list archetype.

**Decision:** Path A is faster and maintains the "human creativity + AI leverage" philosophy.

---

## Prioritized Recommendations

### High Priority
1. **Push modes** — Add `mode: "replace" | "append"` parameter
2. **Three-column archetype** — Common enough to justify
3. **Video/embed archetype** — Even if just a URL field

### Medium Priority
4. **Eyebrow text** — Small addition to existing archetypes
5. **Clone workflow docs** — Document the "design once, clone many" pattern clearly

### Lower Priority / Future
6. **Inline styling** — Major IR change, defer unless demanded
7. **Nested components** — Complex, better solved by capture/clone
8. **Badge primitives** — Nice to have, not blocking

---

## Session Artifacts

### Final Deck Structure (8 slides)
```
1. Title      — 🚝 Monorail
2. Big-idea   — AI decks look great. They don't land.
3. [Custom]   — Loop exited. (static HTML demo)
4. Big-idea   — Arguments aren't generated. (THE TURN)
5. Two-column — Claude + Figma = shared canvas
6. Bullets    — The loop (pull/patch/repeat)
7. [Custom]   — Simpsons video embed
8. Title      — Your next deck deserves an argument
```

### Tools Used
- `monorail_status` — 1 call
- `monorail_pull` — 4 calls
- `monorail_push` — 1 call
- `monorail_delete` — 1 call (11 slides)
- `monorail_capture` — 1 call

---

## Conclusion

Monorail works. The loop is real. The narrative toolkit adds genuine value.

The system's sweet spot is **structured text slides** where argument matters more than visual polish. For **designed visual slides** (like the Keycard example), the capture/clone pattern is the right answer — let humans do what humans do best, then let AI replicate it.

The biggest quality-of-life improvement would be **push modes** (replace vs append). The biggest capability gap is **three-column layouts**.

Ship it. Iterate. The argument will sharpen.
