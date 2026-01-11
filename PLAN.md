# Monorail: Project Plan

> Living document. Updated each session. **Read this first.**

---

## What Is Monorail?

An MCP tool that lets Claude and humans collaborate on presentation decks in Figma. Not "generate and export" — a live loop where both parties work in the same canvas.

**Named after:** Lyle Lanley's monorail pitch in The Simpsons — an argument so tight it sells the room.

---

## Documentation Guide

| When you need... | Go to... |
|------------------|----------|
| Current project state | **This file** (PLAN.md) |
| How something works | `docs/references/` |
| Why we chose X over Y | `docs/decisions/` |
| What didn't work | `docs/failures.md` |
| Exploration before deciding | `docs/discovery/` |
| Quick start for new session | **This file** → "Next Session" section |

### The Ralph Wiggum Method

1. **Start by reading `PLAN.md`** — understand current state
2. **One focused task per session** — don't boil the ocean
3. **Log learnings to `docs/failures.md`** — gotchas, API quirks
4. **Update `PLAN.md` at session end** — brief summary, link to relevant docs
5. **Put details in docs/** — decisions, references, discoveries

**Rule of thumb:** If it's reusable knowledge, it goes in `docs/`. If it's project state, it stays in PLAN.md.

---

## Current State

**v0 complete.** Full round-trip loop working.

**Session 15 complete.** Tool Consolidation: 14 → 6 tools!

### What Works ✅
- WebSocket bridge — no copy/paste, live sync
- Rich export — captures ALL elements with Figma node IDs
- Targeted patches — update specific elements, preserve layouts
- Template capture with design system extraction + slot identification
- **Full deck rendering** — 10 slides from IR in one push
- **Auto Layout for big-idea** — headline/subline no longer overlap
- **Consolidated tool surface** — 6 tools instead of 14

### The Gap 🔨
- **Limited archetypes** — no three-column, no video/embed — hit during dogfood
- **Multi-instance debugging** — need server instance ID to diagnose connection issues when multiple servers run
- **Auto Layout consistency** — title/quote/summary/section use fixed Y positions (see `docs/decisions/auto-layout-consistency.md`)
- **Multi-deck transparency** — each Figma file runs its own plugin instance; need to surface which deck is active
- **No inline styling** — can't do mixed colors in text (e.g., "ACP is north." in cyan) — use capture/clone instead
- **Limited diagrams** — timeline is linear only, no loop arrows or callouts (FUTURE)

### Recently Fixed ✅
- ~~Push always appends~~ — Now has `mode: "replace"` option (Session 17)
- ~~Replace mode positioning~~ — Auto Layout frames now position correctly after delete (Session 17)
- ~~Font handling~~ — Now has fallback chain (Session 17)
- ~~Archetype detection~~ — Frame-based detection, bullets now work (Session 17)
- ~~Pending request state~~ — Consolidated into generic manager (Session 17)

### Key Files
| File | Purpose |
|------|---------|
| `figma-plugin/code.ts` | Plugin: export, apply, patch, capture, instantiate |
| `figma-plugin/ui.html` | Plugin UI + WebSocket bridge |
| `src/index.ts` | MCP server: 6 consolidated tools |
| `docs/decisions/dynamic-templates.md` | Template design + full spike results |

### MCP Tools (8 total)
| Tool | Purpose |
|------|---------|
| `monorail_status` | Check if Figma plugin is connected |
| `monorail_pull` | Get deck state from Figma (slides, elements, IDs) |
| `monorail_push` | Create/replace slides from IR (with inline validation, optional `start_index`) |
| `monorail_patch` | Update specific text elements by Figma node ID |
| `monorail_capture` | Full node tree + design system + slots (all-in-one) |
| `monorail_clone` | Clone slide + update content |
| `monorail_delete` | Delete slides by Figma node ID |
| `monorail_reorder` | Reorder slides to match specified order |

---

## What's Next

**Slide operations complete.** 8 tools total, full deck manipulation.  
**Claude Desktop dogfood complete.** Core loop validated. See `docs/discovery/dogfood-claude-desktop.md`

### Priority 1: Dogfood Fixes (HIGH)
- [x] **Push modes** — Add `mode: "replace" | "append"` parameter (Session 17)
- [ ] **Three-column archetype** — Common layout, hit during dogfood
- [ ] **Video/embed archetype** — Even if just a URL field

### Priority 2: Figma Best Practices
- [ ] Auto Layout for remaining archetypes (title, quote, summary, section) — see `docs/decisions/auto-layout-consistency.md`
- [x] ~~Archetype detection~~ — Frame-based detection (Session 17)
- [x] ~~Font fallback chain~~ — Inter → SF Pro → Helvetica → Arial (Session 17)

### Priority 3: Trust & Transparency
- [ ] Multi-deck awareness — show which file is active, or warn if ambiguous
- [ ] Better push error messages — which slide, which field failed

### Priority 4: Polish (LOW)
- [ ] Eyebrow text — small "OUR POSITION" labels above headlines
- [ ] Clone workflow docs — document "design once, clone many" pattern
- [ ] Role mapping — use semantic roles instead of node IDs

### Future Work (defer)
- Inline styling (mixed colors/weights in text) — use capture/clone instead
- Nested components (cards with sub-elements) — use capture/clone instead
- Diagram/visualization editing (arrows, connectors)
- Full Figma visual language (effects, blending, masks)
- Design system auto-application

---

## Session Log

### Session 17 (2026-01-11)
**Technical Due Diligence: Code Review & Improvements**

Comprehensive code review of the entire codebase, followed by implementation of identified improvements.

**Code Review Findings:**
- IR format reference is ✅ current and valid
- Documentation mostly aligned, some stale tool names in ARCHITECTURE.md
- Codebase well-structured with consistent patterns
- Identified technical debt items for remediation

**Immediate Fixes (completed):**
- ✅ Updated ARCHITECTURE.md with current 8-tool names
- ✅ Fixed IR format example (content must be nested, not flat)
- ✅ Fixed stale "Open Questions" (delete capability now exists)
- ✅ Fixed tool count comments in src/index.ts (was 6, now 8)
- ✅ Removed unused `lastCapturedTemplate` variable

**Major Improvements (completed):**

1. **Pending Request Manager** — Consolidated 14 fragmented variables into clean generic system:
   - `createPendingRequest<T>(type, timeoutMsg)` — create with auto-timeout
   - `resolvePendingRequest<T>(type, result)` — resolve pending request
   - `hasPendingRequest(type)` — check if request in progress
   - Prevents race conditions, reduces code duplication

2. **Archetype Detection** — Rebuilt `analyzeSlideContent()` to use frame-based detection:
   - Now detects `bullets-container`, `big-idea-container`, etc.
   - Falls back to pattern-matching for non-Monorail slides
   - Fixes bullets → "unknown" round-trip bug
   - All 10 archetypes now properly detected

3. **Font Fallback Chain** — Added `loadFontWithFallback()`:
   - Tries fonts in order: Inter → SF Pro Display → Helvetica Neue → Arial
   - Caches successful font load
   - Prevents crashes when custom fonts unavailable
   - Removed all hardcoded Inter font loads

**Files changed:**
- `src/index.ts` — pending request consolidation, dead code removal
- `figma-plugin/code.ts` — archetype detection, font fallback
- `docs/ARCHITECTURE.md` — tool names, IR format, open questions

**Technical debt reduced:** Cleaner async handling, better type safety, improved reliability.

**Plan Review (later same session):**
- Tested all MCP tools via Cursor — full round-trip working
- Reviewed priorities, reorganized based on Figma best practices
- Added `docs/decisions/auto-layout-consistency.md` — rationale for consistent Auto Layout
- Updated Next Session Prompt to reflect current state

**Claude Desktop Dogfood (later same session):**
- Full 45-minute session: narrative analysis → IR generation → Figma rendering → human edits → AI adaptation
- Transformed messy 11-slide deck into tight 8-beat structure
- **Core loop validated** — pull/push/patch all work correctly
- **Human spikes preserved** — custom slides detected as `archetype: "unknown"` (correct!)
- **Key finding:** Push appends instead of replacing — needed manual delete of old slides
- **Stress test:** Keycard slide revealed archetype ceiling (three-column, nested cards, inline styling)
- **Recommendation:** Complex layouts → capture/clone pattern; simple layouts → IR archetypes
- Full report: `docs/discovery/dogfood-claude-desktop.md`

### Session 16 (2026-01-11)
**Slide Operations: delete, position, reorder + Rich Feedback**

Added three new capabilities for full deck manipulation:

**New tools:**
- `monorail_delete` — delete slides by Figma node ID
- `monorail_reorder` — reorder slides to match specified order

**Enhanced:**
- `monorail_push` now accepts `start_index` param to insert at position

**Rich feedback in plugin UI:**
- Delete shows slide names: `Deleted: "Testing Rich Feedback"`
- Push shows what was created/updated: `Created "My Title" • Updated "Intro"`
- Reorder shows what moved: `Moved: "Conclusion", "Summary"`
- Position shows index: `... at pos 0`

**Vocabulary alignment:**
- "Export" → "Pull" throughout plugin UI
- Consistent with MCP tool naming (push/pull)

**Discovery:**
- Each Figma file runs its own plugin instance (same MCP server, multiple clients)
- Need to surface which deck is active → added to Gap

**Docs updated:**
- `docs/references/mcp-tools.md` — new tools documented
- `docs/discovery/architecture-review.md` — tool list updated
- MCP resource `monorail://ir-format` — now shows pull format with `figma_id` and `elements`

**Tool count:** 6 → 8

### Session 15 (2026-01-11)
**Tool Consolidation: 14 → 6**

Simplified the MCP tool surface to reduce cognitive load for Claude.

**Tools consolidated:**
- `monorail_status` (was `connection_status`)
- `monorail_pull` (was `pull_ir`)
- `monorail_push` (was `push_ir`, now with inline validation)
- `monorail_patch` (was `patch_elements`)
- `monorail_capture` (was `capture_template` + `extract_template` + `extract_design_system`)
- `monorail_clone` (was `instantiate_template`)

**Tools removed:**
- `create_deck`, `update_slides`, `get_deck` → use push/pull
- `validate_ir` → inlined into push
- `preview` → rarely used
- `create_styled_slide` → deferred

**Key insight:** The `pull → patch` loop IS the product. Push is just bootstrapping.

### Session 14 (2026-01-11)
**Dogfooding: Render Monorail Deck via MCP**

Tested the full pipeline by rendering `examples/monorail-deck-v0.html` (10 slides) through MCP → Figma.

**What worked:**
- ✅ All 10 slides rendered in one push_ir call
- ✅ Archetypes: title, bullets, big-idea, two-column, quote, summary, timeline
- ✅ Timeline with blue dots, connecting lines, 4 stages
- ✅ Auto Layout for bullets works correctly

**Bug fixed:**
- 🔧 Big-idea slides had overlapping headline/subline (fixed Y positions)
- → Changed to Auto Layout container, now flows properly

**Gaps discovered:**
- Slide positioning (appends to end, can't insert at position)
- Archetype detection (bullets → "unknown" on export)
- Limited visualizations (no loop arrows, callouts, emphasis boxes)
- Design system not applied (using Inter + defaults)

**Docs:** `docs/discovery/dogfood-gaps.md`

### Session 13 (2026-01-11)
**Template Extraction + Instantiation + Design System Spike**

Built:
- `monorail_extract_template` — compact template from captured slide
- `monorail_instantiate_template` — clone slide + update text
- `monorail_extract_design_system` — pull colors, fonts, spacing as tokens
- `monorail_create_styled_slide` — generate new layouts with design tokens

**Full Pipeline Tested:**
1. Capture slide-10 (120 nodes, 143KB)
2. Extract template (9 slots, 6KB — 89% smaller)
3. Clone → SOLUTION slide with new content (4/5 text slots updated)
4. Extract design system (11 colors, 4 fonts, spacing values)
5. Generate new "quote" slide using extracted tokens

**What Works:**
- ✅ Clone + update preserves ALL styling, diagrams, images
- ✅ Design tokens extracted and applied to new layouts
- ✅ Text patching works for available fonts
- ✅ Complex diagrams stay intact (filtered but preserved)

**Gaps Identified:**
- ⚠️ Font availability — custom fonts (Supply) cause failures, need fallbacks
- ⚠️ Accent color selection — picked red instead of lime for quote
- ⚠️ Diagram text editable via patch, but images/structure not yet
- ⚠️ Section label role detection needs absolute Y, not local

**Decision: Focus on base use-case first**
- Get text + layout flow flawless before tackling diagram editing
- Diagrams/visualizations are future work (Figma's full visual language)

### Session 12 (2026-01-11)
**Template Capture Spike**

Proved:
- ✅ Can read full frame structure recursively (120 nodes from complex slide)
- ✅ Get all styling: fills, strokes, gradients, Auto Layout, fonts, effects
- ✅ Custom fonts captured (e.g., "Supply" font in section label)
- ✅ MCP tool `monorail_capture_template` working end-to-end

Discovered:
- ⚠️ Complex slides are HUGE (slide-10: 120 nodes, 143KB vs slide-11: 6 nodes, 2KB)
- Need to filter/summarize for practical templates
- Slot identification needs heuristics: depth, naming, position

Design decisions made:
- Diagrams → placeholder/omit for MVP (option C)
- Template = left-side structure only for now
- Focus on: section_label, headline, accent_points (repeatable cards)

Next: Build `monorail_extract_template` with filtering

### Session 11 (2026-01-11)
**Rich Read + Targeted Write**

Built:
- Recursive element finder (`getAllTextNodes`)
- Element classification (headline, accent_text, diagram_text)
- `monorail_patch_elements` tool

Proved:
- Can read 25+ elements from complex slide (was: just headline)
- Can patch specific elements without destroying layout

Discovered:
- New slide creation doesn't match existing custom styles
- Need dynamic templates → see `docs/decisions/dynamic-templates.md`

### Session 10 (2026-01-11)
**Plugin API Audit + Design System Strategy**

- Implemented Auto Layout for bullets, gradients for title
- Key insight: Gap is USAGE, not capability
- Breakthrough: Intent-based collaboration model

Details: `docs/decisions/design-system-strategy.md`

### Sessions 1-9
See git history. Key milestones:
- Session 3: v0 loop complete
- Session 5: Freeform edit handling
- Session 8: WebSocket bridge complete

---

## Quick Reference

```
monorail-mcp/
├── PLAN.md                    # You are here
├── src/index.ts               # MCP server
├── figma-plugin/              # Figma plugin
└── docs/
    ├── decisions/             # Why we chose X
    │   ├── dynamic-templates.md   ← NEXT
    │   ├── design-system-strategy.md
    │   ├── websocket-bridge.md
    │   └── ...
    ├── references/            # How things work
    │   ├── mcp-tools.md
    │   ├── plugin-api.md
    │   ├── archetypes.md
    │   └── ...
    ├── discovery/             # Spikes before decisions
    └── failures.md            # What didn't work
```

---

## Next Session Prompt

Copy this to start:

```
I'm working on Monorail — Claude + human collaboration on decks via Figma.

**Read first:** PLAN.md (current state, priorities)

**Key files:**
- src/index.ts (MCP server — 8 tools)
- figma-plugin/code.ts (plugin — export, apply, patch, capture, instantiate, delete, reorder)

**MCP Tools (8):**
| Tool | Purpose |
|------|---------|
| monorail_status | Is plugin connected? |
| monorail_pull | Get deck state (slides, elements, IDs) |
| monorail_push | Create/replace slides from IR (+ start_index) |
| monorail_patch | Update specific elements by ID |
| monorail_capture | Full node tree + design system + slots |
| monorail_clone | Clone slide + update content |
| monorail_delete | Delete slides by ID |
| monorail_reorder | Reorder slides |

**This session:** [describe focus]

Current priorities (from Claude Desktop dogfood):
1. Push modes — add "replace" option (currently always appends)
2. Three-column archetype — common layout, hit during dogfood
3. Auto Layout consistency — title/quote/summary use fixed Y positions

**Key insight:** The pull → patch loop IS the product. Push is just bootstrapping.
Complex layouts → capture/clone pattern. Simple layouts → IR archetypes.
```
