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

**Session 19 complete.** Capture → Clone workflow validated.

### What Works ✅
- WebSocket bridge — no copy/paste, live sync
- Rich export — captures ALL elements with Figma node IDs
- Targeted patches — update specific elements, preserve layouts
- Template capture with design system extraction + slot identification
- **Full deck rendering** — 10 slides from IR in one push
- **Auto Layout for ALL archetypes** — title, section, quote, summary, big-idea, bullets, two-column all use containers
- **Consolidated tool surface** — 9 tools total, 11 archetypes
- **Visual feedback** — `monorail_screenshot` exports slides as PNG so AI can "see" what it rendered
- **Complex archetypes** — `position-cards` renders 3-column cards with badges
- **Video archetype** — placeholder with play icon + URL for video embeds
- **Collaborative editing** — pull → patch works on complex slides (24 elements)
- **Capture → Clone workflow** — design in Figma, capture structure, clone with new content
- **Capture by slide ID** — no selection required
- **Configurable capture depth** — `max_depth` param for complex nested slides
- **Font fallback everywhere** — patches and clones both use fallback chain
- **Table extraction** — pull captures Figma Slides tables with cell content and row/col metadata

### The Gap 🔨
- **Multi-instance debugging** — need server instance ID to diagnose connection issues when multiple servers run
- **Multi-deck transparency** — each Figma file runs its own plugin instance; need to surface which deck is active
- **No inline styling** — can't do mixed colors in text (e.g., "ACP is north." in cyan) — use capture/clone instead
- **Clone preserves exact colors** — need design system remap (see `docs/discovery/design-system-remap.md`)
- **Limited diagrams** — timeline is linear only, no loop arrows or callouts (FUTURE)
- **Simpler three-column** — position-cards is complex; basic 3-col would be useful

### Key Files
| File | Purpose |
|------|---------|
| `figma-plugin/code.ts` | Plugin: export, apply, patch, capture, instantiate |
| `figma-plugin/ui.html` | Plugin UI + WebSocket bridge |
| `src/index.ts` | MCP server: 9 tools |
| `shared/types.ts` | Shared TypeScript types (DeckIR, Slide, etc.) |
| `docs/decisions/dynamic-templates.md` | Template design + full spike results |

### MCP Tools (9 total)
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
| `monorail_screenshot` | Export slide as PNG image — gives AI "eyes" to see what was rendered |

---

## What's Next

**Slide operations complete.** 8 tools total, full deck manipulation.  
**Claude Desktop dogfood complete.** Core loop validated. See `docs/discovery/dogfood-claude-desktop.md`

### Priority 1: Dogfood Fixes (HIGH)
- [x] **Push modes** — Add `mode: "replace" | "append"` parameter (Session 17)
- [x] **Three-column archetype** — `position-cards` archetype handles this (Session 18)
- [x] **Capture → Clone workflow** — Design slide in Figma → capture → clone with new content (Session 19)
- [x] **Configurable capture depth** — `max_depth` param for complex nested slides (Session 19)
- [x] **Capture by slide ID** — No selection required, capture any slide by ID (Session 19)
- [x] **Font fallback for patches** — Deep nodes now use fallback chain (Session 19)
- [x] **Video/embed archetype** — `video` archetype with URL placeholder + play icon (Session 23)
- [ ] **Simpler three-column** — Basic 3-col without badges (lower complexity than position-cards)

### Priority 2: Figma Best Practices
- [x] **Auto Layout for all archetypes** — title, quote, summary, section now use containers (Session 23)
- [x] **Fix two-column archetype** — Now uses nested Auto Layout containers (Session 22)
- [x] ~~Archetype detection~~ — Frame-based detection (Session 17)
- [x] ~~Font fallback chain~~ — Inter → SF Pro → Helvetica → Arial (Session 17)

### Priority 3: Trust & Transparency
- [ ] Multi-deck awareness — show which file is active, or warn if ambiguous
- [ ] Better push error messages — which slide, which field failed

### Priority 4: Polish (LOW)
- [x] Eyebrow text — implemented in `position-cards` archetype (Session 18)
- [ ] Clone workflow docs — document "design once, clone many" pattern
- [ ] Role mapping — use semantic roles instead of node IDs
- [x] Shared types — extract to `shared/types.ts`, import in both plugin/server (Session 26)
- [ ] Auto-generate MCP resources — derive from ARCHETYPES object
- [x] **esbuild for plugin** — bundler set up, targets ES2017 for Figma compatibility (Session 26)
- [ ] **Split plugin into modules** — `code.ts` is 3,400+ lines; esbuild ready, needs actual split

### Priority 5: Visual Richness
- [x] **SVG support in IR** — `visual: { type: "svg", content: "..." }` with `createNodeFromSvg()`. Works but quality is poor — text wrapping unpredictable, positioning blind. (Session 21)
- [x] **Native diagram DSL** — `visual: { type: "cycle", nodes: [...], colors: [...] }`. Plugin renders with native Figma shapes. **Works well** — proper text, clean circles, correct colors. (Session 21)
- [x] **Smart sizing defaults** — Right=65%, Center=70%, Below=40%×35% of slide dimensions. (Session 21)
- [ ] **Placeholder frames** — Mark "visual goes here" in IR, renders as labeled placeholder in Figma. User fills in manually.
- [ ] **More diagram types** — funnel, timeline, 2x2 matrix, org chart. Same DSL approach as cycle.
- [ ] **Icon component library** — Use Figma's built-in Heroicons library (outline + solid) via `importComponentByKeyAsync()`. Programmatic shapes don't look good. Figma also has "Diagrams by Figma" library worth exploring. (Session 21 discovery)

**Key insight (Session 21):** Diagrams need a **dedicated mode**. Mixing diagram design into deck iteration breaks flow. Build deck structure first (fast), design diagrams later (focused).

### Discovery Needed
- [ ] **AI Developer Experience (AI DX)** — How do we make Monorail easy for Claude to use? Tool descriptions, workflow hints, error recovery, proactive suggestions. See `docs/discovery/ai-dx.md`
- [ ] **Clone with design system remap** — When cloning, preserve layout + color *distribution* (accent vs muted vs bg) but apply a different palette. Currently clone copies exact colors from source. See `docs/discovery/design-system-remap.md`
- [x] **Visual feedback / screenshot** — `monorail_screenshot` exports slides as PNG (Session 24)
- [ ] **Shape round-tripping** — Pull only captures text nodes, not shapes (ellipses, vectors, arrows). Manual diagram edits are lost on re-push. Need to detect/extract shapes during pull, store in IR, recreate on push. Would enable true round-trip of user-customized diagrams.
- [ ] **Shape position in capture** — `monorail_capture` extracts colors from shapes but not x/y positions. Limits "capture user's manual fix → update code" workflow. See `docs/discovery/shape-position-capture.md` (Session 25)
- [x] **Table read support** — Pull now captures Figma Slides tables with cell content, row/col metadata (Session 22)
- [ ] **Table write support** — Create/update tables via IR. Need to explore Figma API for table creation.

### Future Work (defer)
- Inline styling (mixed colors/weights in text) — use capture/clone instead
- Nested components (cards with sub-elements) — use capture/clone instead
- Diagram/visualization editing (arrows, connectors)
- Full Figma visual language (effects, blending, masks)
- Design system auto-application

---

## Session Log

### Session 26 (2026-01-12)
**Technical Debt: Shared Types + esbuild Setup**

Addressed key technical debt items from the codebase review.

**Shared Types (`shared/types.ts`):**
- Moved all shared TypeScript interfaces to new `shared/types.ts` file
- Server imports via `import type { ... } from "../shared/types.js"`
- Plugin imports via `import type { ... } from '../shared/types'`
- Eliminates duplication between plugin (3,400 lines) and server (2,000 lines)
- Types: `DeckIR`, `Slide`, `SlideContent`, `ElementInfo`, `CapturedNode`, `DesignSystem`, etc.

**Dead Code Removal:**
- Removed `generatePreviewHTML()` and `escapeHtml()` from server (~700 lines)
- Was remnant of HTML preview feature, never used via MCP

**esbuild for Plugin:**
- Standard approach for Figma plugins (discovered via research)
- TypeScript does type checking only (`noEmit: true`)
- esbuild bundles to single file, strips `import type` statements
- Targets ES2017 for Figma runtime compatibility
- Fixes two issues:
  1. `export {}` at end of file (Figma doesn't support ES modules)
  2. `catch {}` syntax (ES2019, not supported in Figma's runtime)

**Build Commands:**
- Server: `npm run build` (unchanged)
- Plugin: `npm run build` (now runs `tsc` + `esbuild`)
- Plugin watch: `npm run watch` (esbuild watch mode)

**Files changed:**
- `shared/types.ts` — new file with all shared types
- `src/index.ts` — imports from shared, dead code removed
- `figma-plugin/code.ts` — imports from shared
- `figma-plugin/package.json` — added esbuild, updated scripts
- `figma-plugin/tsconfig.json` — noEmit, include shared types
- `tsconfig.json` — rootDir adjusted for shared types
- `.gitignore` — ignore generated files

**Key learning:** Figma plugins need a bundler. Plain `tsc` output includes ES module syntax that Figma's runtime doesn't support. This is standard practice — official Figma samples use esbuild/webpack.

### Session 25 (2026-01-12)
**Visual QA Workflow Validated + Video Play Button Fix**

Tested the screenshot capability end-to-end and fixed a visual bug using the new feedback loop.

**Visual QA Workflow:**
1. `monorail_push` — create video slide
2. `monorail_screenshot` — see what Figma rendered
3. Identified issue: play button triangle pointing LEFT instead of RIGHT, off-center
4. Fixed code, rebuilt plugin (hot reloads automatically!)
5. `monorail_screenshot` — verified fix worked

**Bug Fixed — Video Play Button:**
- **Problem:** Triangle was pointing left (◀) and off-center
- **Root cause:** `rotation = 90` goes counter-clockwise, needed `-90` for clockwise
- **Fix:** Changed rotation to `-90`, adjusted x/y to (600, 320) for optical centering, reduced size (40→36px)
- **Iteration:** AI got close but user manually fine-tuned in Figma, then reported values back
- **Result:** Clean centered play button (▶) in circle

**Gap Discovered — Shape Position Capture:**
- `monorail_capture` extracts colors from shapes (ellipses, polygons) but not their x/y positions
- Only TEXT and FRAME nodes get position data as "slots"
- This limits the "capture what user did → replicate in code" workflow for visual elements
- Added to Discovery Needed

**Discovery — Plugin Hot Reload:**
- Figma automatically reloads plugin when `code.js` changes on disk
- No need to manually close/reopen plugin during development
- Use `npm run watch` for continuous compilation
- Documented in `docs/failures.md`

**Key Insight:**
The screenshot capability enables a true visual QA loop. AI can now:
1. Make changes
2. See the result
3. Spot issues
4. Fix and verify

This closes the "blind AI" gap identified in Session 20.

**Files changed:**
- `figma-plugin/code.ts` — video play button positioning fix
- `docs/failures.md` — hot reload discovery

### Session 24 (2026-01-12)
**Screenshot Export — Giving AI "Eyes"**

Added `monorail_screenshot` tool so the AI can see what Figma renders.

**Implementation:**
- Plugin: `export-screenshot` message handler using `node.exportAsync({ format: 'PNG' })` + `figma.base64Encode()`
- UI: WebSocket relay for `request-screenshot` → `screenshot-exported`
- Server: `monorail_screenshot` tool returning image content type

**Features:**
- Export any slide by ID or selection
- Configurable scale (default 0.5x for smaller images)
- Returns PNG as base64 with dimensions
- Enables visual QA workflow: push → screenshot → iterate

**Why this matters:**
- AI was blind — could read content but never see the actual design
- Now can verify layouts, check alignment, spot visual issues
- Closes the loop on quality — no more "trust me, it looks right"

**Files changed:**
- `figma-plugin/code.ts` — screenshot export handler
- `figma-plugin/ui.html` — WebSocket relay for screenshot
- `src/index.ts` — `monorail_screenshot` tool + pending request handling
- `docs/references/mcp-tools.md` — tool documentation

**Tool count:** 8 → 9

### Session 23 (2026-01-12)
**Auto Layout Consistency + Video Archetype**

Two improvements this session:

#### 1. Auto Layout for Remaining Archetypes

Converted the last four archetypes from fixed Y positions to Auto Layout:

| Archetype | Container | Notes |
|-----------|-----------|-------|
| title | `title-container` | Keeps gradient background, text flows in container |
| section | `section-container` | Single headline, ready for subline if needed |
| quote | `quote-container` | Quote + attribution with 40px spacing |
| summary | `summary-container` + `items-container` | Nested containers for proper item spacing |

**Pattern:** Same as big-idea/bullets/two-column — `createAutoLayoutFrame()` + `addAutoLayoutText()`.

**Detection updated:** Added container-based detection for all four archetypes in `analyzeSlideContent()`.

#### 2. Video/Embed Archetype

New `video` archetype for embedding video placeholders:

```typescript
{
  archetype: "video",
  content: {
    headline: "Product Demo",
    video_url: "https://www.loom.com/share/...",
    caption: "2-minute walkthrough of the new dashboard"
  }
}
```

**Renders as:**
- Headline at top
- 16:9 placeholder frame with play button icon
- Clickable URL text below
- Optional caption

**Not actual video playback** — Figma doesn't support that. This is a placeholder that makes it clear where video content goes.

**Files changed:**
- `figma-plugin/code.ts` — Auto Layout for 4 archetypes, video archetype rendering + detection
- `src/index.ts` — video archetype in ARCHETYPES, SlideContent fields
- `docs/decisions/auto-layout-consistency.md` — marked as implemented

**Archetype count:** 10 → 11

**Known issues (now fixed):**
- ~~Video play button icon is off-center~~ — Fixed in Session 25
- ~~Need screenshot export~~ — Added in Session 24

**Video embed discovery:**
- Figma Slides HAS native YouTube embeds (user can paste URL manually)
- Plugin API does NOT expose this — only `createVideoAsync()` with raw bytes
- Our `video` archetype is a placeholder, not a real embed
- Best workflow: use archetype as "video goes here" marker, user embeds manually

### Session 22 (2026-01-12)
**Fix: Two-Column Auto Layout + Table Support Discovery**

Two fixes this session:

#### 1. Two-Column Archetype Auto Layout

Fixed the broken two-column archetype that used fixed Y positions causing overlaps when text wrapped.

**Problem:**
- Old layout used hardcoded positions: headline at y=150, titles at y=320, bodies at y=390
- Long text would overlap because positions didn't adapt

**Solution:**
Converted to nested Auto Layout structure (like big-idea and bullets):
```
two-column-container (VERTICAL, y=150)
├── headline
└── columns-container (HORIZONTAL, gap=40)
    ├── left-column (VERTICAL, width=740)
    │   ├── left-title
    │   └── left-body
    └── right-column (VERTICAL, width=740)
        ├── right-title
        └── right-body
```

**Tested:**
- ✅ Push creates Auto Layout structure
- ✅ Pull detects archetype and extracts content from nested containers
- ✅ Patch works on deeply nested elements (depth 4)

#### 2. Table Support (Discovery)

Added table extraction to capture and pull functions.

**What works:**
- `monorail_capture` now extracts TABLE nodes with `numRows`, `numColumns`, `tableCells`
- `monorail_pull` now includes table cells as elements with `type: "table_cell"`
- Table cells include metadata: `isTableCell`, `tableRow`, `tableCol`

**What's missing:**
- No table creation via IR/push (read-only for now)
- No table patching (need to test if standard patch works on table cells)
- Cell positions are approximated (Figma doesn't expose individual cell coords)

**Files changed:**
- `figma-plugin/code.ts` — Two-column Auto Layout, table capture/pull

### Session 21 (2026-01-12)
**Visual Richness: SVG → Native Figma Diagrams**

Spiked adding visual diagrams to slides. Explored multiple approaches.

**Approach 1: Raw SVG (poor quality)**
- Added `visual: { type: "svg", content: "..." }` to IR schema
- Plugin uses `figma.createNodeFromSvg()` to render
- **Result:** Technically works, but quality is poor — text wraps unpredictably, font rendering differs from Figma native

**Approach 2: Diagram DSL with native Figma rendering (success)**
- Added `visual: { type: "cycle", nodes: [...], colors: [...] }` 
- Plugin renders using native Figma APIs: `createEllipse()`, `createText()`, `createVector()`
- **Result:** Clean circles, proper text rendering, correct colors, editable after placement
- Smart sizing defaults: right=65% of height, center=70%, below=40%×35%

**Approach 3: Icons inside nodes (partial success)**
- Added `icons` field to visual schema
- First attempt: SVG paths → failed (`vectorPaths` requires different syntax than standard SVG)
- Second attempt: Native Figma shapes (`createEllipse`, `createRectangle`, `createPolygon`, `createStar`)
- **Result:** Icons render but quality is poor — hand-drawing icons from primitives isn't great
- **Learning:** Icons need proper design (component library) not programmatic shape-mashing

**Icon discovery:**
Figma icons are typically managed via:
1. Component libraries (publish, reference by key)
2. Icon plugins (Iconify, Material Icons)
3. Team libraries

**Better path discovered:** Figma has built-in libraries accessible from the assets panel:
- **Heroicons by Tailwind CSS** — outline + solid variants, production-quality
- **Diagrams by Figma** — native diagram components

Use `importComponentByKeyAsync()` to pull from these libraries instead of hand-drawing.
**Decision:** Defer icons to future session. Cycle diagram without icons is already a win.

**Key insight:**
Diagrams need a **dedicated mode**. Mixing diagram design into deck iteration breaks flow:
- **Deck building mode**: Fast iteration on structure, headlines, bullets
- **Visualization mode**: Focused, deliberate design of specific diagrams

**Shipped:**
- ✅ `visual: { type: "cycle" }` with native Figma rendering
- ✅ Smart sizing defaults based on position
- ✅ Color-coded nodes with labels below
- ✅ Curved connectors between nodes
- ✅ Directional arrowheads on connectors
- ✅ Bold 32px labels (user-validated default)
- ⏸️ Icons deferred (needs component library approach)

**Late discovery (same session):**
User manually tweaked diagram in Figma (better layout, sizing). On re-push, manual edits lost.
- **Root cause:** Pull only captures text nodes, not shapes (circles, arrows, vectors)
- **Impact:** Can't round-trip user-customized diagrams
- **Future work:** Shape extraction during pull → store in IR → recreate on push
- Added to Discovery Needed

**Files changed:**
- `src/index.ts` — visual field with cycle/svg/icons schema
- `figma-plugin/code.ts` — cycle renderer, icon renderer (experimental), smart sizing
- `PLAN.md` — session log, priority updates

**GTM deck now has:** Working flywheel diagram with 5 colored nodes (Show up → Learn → Iterate → Compound → Gravity)

### Session 20 (2026-01-12)
**Deep Dogfood: Building a GTM Deck Live**

Extended dogfood session — built a real GTM kick-off deck collaboratively, iterating through multiple strategic frames.

**What we built:**
- Started with context deck (40+ slides of company strategy)
- Built GTM kick-off deck from scratch
- Iterated through 4+ structural rewrites as strategy evolved:
  1. Generic kick-off structure
  2. "First meeting" frame (team initialization)
  3. "Learning velocity" frame (optimize for learning, not speed)
  4. "Compounding returns" frame (learning → credibility → gravity)
- Final deck: 14 slides with narrative arc

**What worked beautifully:**
- ✅ **Pull-as-context** — Grabbed strategy deck, used it to inform new deck. No export, no copy-paste. Just `monorail_pull` and suddenly 40+ slides of context available.
- ✅ **Iterative structure** — Rebuilt deck 4+ times as thinking evolved. Each `monorail_push` with `mode: "replace"` just works.
- ✅ **Bidirectional edits** — User edited in Figma (line breaks, text tweaks), pull showed the changes, loop closed.
- ✅ **Fast narrative iteration** — Strategic reframing ("we're optimizing for learning, not speed") → new deck structure in minutes.

**Friction points confirmed:**
- ⚠️ **Multi-deck session bug** — Had to re-run plugin when switching Figma files. Known issue, workaround works.
- ⚠️ **Two-column archetype broken** — Layout bug (overlapping, off-screen). Deleted slide rather than fight it. Already in plan.
- ⚠️ **LLM is blind** — Can read content but can't see design. Trusting user for visual QA.

**Major gap identified: Visual poverty**
- Decks are text-only: headlines, sublines, bullets
- No images, illustrations, icons, diagrams, charts
- "The flywheel" should *look* like a flywheel
- Even placeholder frames ("visual goes here") would help

**SVG opportunity:**
- Figma API has `createNodeFromSvg()` — can render SVG strings as vector nodes
- Claude can generate simple SVGs: flowcharts, cycles, boxes with arrows
- Would transform decks from "text walls" to visual storytelling
- Added to plan as Priority 5: Visual Richness

**Key insight:** The pull-as-context pattern is more powerful than expected. "Grab any deck, use it as source material for new work" is a workflow that didn't exist before. Not exporting, not copy-pasting — just reading a deck with an LLM and riffing on it.

**Files changed:**
- `PLAN.md` — this session log, Priority 5 added

### Session 19 (2026-01-11)
**Capture → Clone Workflow Validated + Plugin Enhancements**

Full validation of the capture → clone workflow for complex slides.

**Workflow tested:**
1. Created fresh "Monorail" deck using templates from slides 4 (position-cards) and 5 (3-column)
2. Cloned templates with new content — preserved all styling, structure, fonts
3. Patched deep nested elements (depth 4) — required font fallback fix

**Enhancements implemented:**
- ✅ **Configurable `max_depth`** for `monorail_capture` — allows capturing deeper nested content as editable slots
- ✅ **Capture by `slide_id`** — no selection required, fetch any slide by Figma node ID
- ✅ **Font fallback for patches** — `applyPatches()` now uses fallback chain like clone does
- ✅ **Font substitution reporting** — both patch and clone report when fonts are substituted

**Key insight:** Both limitations we hit (deep patch failures, capture requiring selection) were **our plugin code choices**, not Figma API restrictions. Easy fixes.

**Files changed:**
- `figma-plugin/code.ts` — font fallback in applyPatches, slideId param in capture-template
- `src/index.ts` — slide_id param for monorail_capture tool

**Monorail deck created:** 4-slide deck demonstrating the tool's own workflow (meta!)

### Session 18 (2026-01-11)
**Complex Template Strategy: position-cards Archetype**

Explored how to handle slides as complex as the Keycard example (3-column cards, badges, features row).

**Analysis:**
- Capture/clone limited by `MAX_SLOT_DEPTH = 2` — deeply nested content becomes "complex regions"
- Mixed-color headlines (character-level styling) not programmatically changeable
- Decision: Hybrid approach — archetypes for repeatable patterns, capture/clone for one-offs

**Implementation:**
- ✅ New `position-cards` archetype with:
  - Cyan eyebrow label
  - Multi-line headline + subline
  - 3 cards (label, title, body, colored badge)
  - Feature row with orange dots
- ✅ Successfully rendered Keycard-style slide from IR
- ✅ Tested collaborative editing — user added line breaks, Claude patched feature text, no conflicts

**Docs created:**
- `docs/decisions/complex-templates.md` — strategy decision
- `docs/discovery/complex-template-experiment.md` — experiment notes
- `docs/ADDING-ARCHETYPES.md` — step-by-step guide for adding new archetypes

**Key insight:** Template complexity doesn't affect collaboration — every text element has a stable node ID, patches are surgical.

**Friction identified:**
- Type duplication between plugin and server
- MCP resources hardcoded (easy to forget updates)
- Server restart clunky (kill process, wait for Cursor restart)
- Plugin reconnection required after server restart

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

**Read first:** PLAN.md (current state, priorities, session 26 learnings)

**What works now:**
- Full round-trip: pull → patch → push
- 9 MCP tools, 11 archetypes
- **Auto Layout for ALL archetypes** — title, section, quote, summary, big-idea, bullets, two-column
- **Video archetype** — placeholder with play icon + URL
- **Cycle diagrams** with native Figma rendering
- **Table extraction** — pull captures Figma tables with cell content + row/col metadata
- **Screenshot export** — `monorail_screenshot` gives AI "eyes" to see rendered slides
- **Shared types** — `shared/types.ts` for plugin + server
- **esbuild bundler** — proper Figma plugin build pipeline

**Gaps:**
- **Shape round-tripping** — Pull only gets text, not shapes. Manual diagram edits lost on re-push.
- **Table creation** — Can read tables, but can't create/update via IR yet.
- **Icons** — Hand-drawn shapes look bad. Figma has Heroicons library we could use.
- **Simpler three-column** — Basic 3-col without badges (position-cards is complex)
- **Plugin is monolithic** — 3,400 lines in one file; esbuild is set up, ready to split

**This session options:**

**Option A: Split plugin into modules**
Now that esbuild is set up, split `code.ts` into logical modules:
- `archetypes/` — one file per archetype renderer
- `utils/` — font loading, Auto Layout helpers
- `handlers/` — message handlers (push, pull, patch, etc.)
- Would make codebase much more maintainable

**Option B: More diagram types (Priority 5)**
Extend the diagram DSL:
- `funnel` — top-to-bottom narrowing stages
- `timeline` — horizontal stages with markers  
- `matrix` — 2x2 grid with labels
- File: `figma-plugin/code.ts`, search for `renderCycleDiagram`

**Option C: Shape round-tripping (Discovery)**
Enable true round-trip of manual diagram edits.
- Extend pull to detect shapes (ellipses, vectors, rectangles)
- Store positions/sizes/colors in IR
- Recreate exactly on push

**Option D: Table write support (Discovery)**
Can read tables, now explore creating/updating them.
- Investigate `figma.createTable()` API
- Add `table` archetype or IR field
- Useful for comparisons, feature matrices

**Option E: Heroicons integration (Discovery)**
Use Figma's built-in Heroicons library for diagram icons.
- `importComponentByKeyAsync()` to pull from library
- Much cleaner than hand-drawing shapes
- Both outline + solid variants available

**Option F: Simpler three-column archetype**
Basic 3-col layout without badges/complexity of position-cards.
- Just headline + 3 titled body sections
- Use Auto Layout pattern from two-column

**Key files:**
- `figma-plugin/code.ts` — rendering logic (monolithic, ready to split)
- `src/index.ts` — MCP tools + IR schema
- `shared/types.ts` — shared TypeScript types
- `PLAN.md` — session logs, priorities
```
