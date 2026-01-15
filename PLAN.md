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
- **Consolidated tool surface** — 10 tools total, 11 archetypes
- **Visual feedback** — `monorail_screenshot` exports slides as PNG so AI can "see" what it rendered
- **Complex archetypes** — `position-cards` renders 3-column cards with badges
- **Video archetype** — placeholder with play icon + URL for video embeds
- **Collaborative editing** — pull → patch works on complex slides (24 elements)
- **Capture → Clone workflow** — design in Figma, capture structure, clone with new content
- **Capture by slide ID** — no selection required
- **Configurable capture depth** — `max_depth` param for complex nested slides
- **Font fallback everywhere** — patches and clones both use fallback chain
- **Table extraction** — pull captures Figma Slides tables with cell content and row/col metadata
- **Add elements to containers** — `monorail_patch` with `action: "add"` appends text to Auto Layout containers (bullets, items). Inherits sibling styling. No delete/recreate needed!
- **Container discovery** — `monorail_pull` surfaces addable containers so AI can discover where to use `action: "add"`
- **Primitives for design** — `monorail_primitives` creates slides from scratch (frames, text, shapes) — enables Claude to design without archetypes
- **Gradient backgrounds** — linear and radial gradients via `op: "background"` with `gradient` config
- **Arrow connectors** — `line` with `startCap`/`endCap` for simple arrows (independent end control)
- **Multi-point paths** — `path` op with `points` array, `smooth` bezier curves, `closed` shapes

### The Gap 🔨
- **Multi-instance debugging** — need server instance ID to diagnose connection issues when multiple servers run
- **Multi-deck transparency** — each Figma file runs its own plugin instance; need to surface which deck is active
- **No inline styling** — can't do mixed colors in text (e.g., "ACP is north." in cyan) — use capture/clone instead
- **Clone preserves exact colors** — need design system remap (see `docs/discovery/design-system-remap.md`)
- **Limited diagrams** — timeline is linear only, no loop arrows or callouts (FUTURE)
- **Simpler three-column** — position-cards is complex; basic 3-col would be useful
- **Add compound elements** — `action: "add"` only works for simple text nodes (bullets, items). Can't add cards, columns, or nested structures. Future: clone sibling subtree + content map.

### Key Files
| File | Purpose |
|------|---------|
| `figma-plugin/code.ts` | Plugin: export, apply, patch, capture, instantiate |
| `figma-plugin/ui.html` | Plugin UI + WebSocket bridge |
| `src/index.ts` | MCP server: 9 tools |
| `shared/types.ts` | Shared TypeScript types (DeckIR, Slide, etc.) |
| `docs/decisions/dynamic-templates.md` | Template design + full spike results |

### MCP Tools (10 total)
| Tool | Purpose |
|------|---------|
| `monorail_status` | Check if Figma plugin is connected |
| `monorail_pull` | Get deck state from Figma (slides, elements, IDs) |
| `monorail_push` | Create/replace slides from IR (with inline validation, optional `start_index`) |
| `monorail_patch` | Edit text elements OR add/delete elements in Auto Layout containers |
| `monorail_capture` | Full node tree + design system + slots (all-in-one) |
| `monorail_clone` | Clone slide + update content |
| `monorail_delete` | Delete slides by Figma node ID |
| `monorail_reorder` | Reorder slides to match specified order |
| `monorail_screenshot` | Export slide as PNG image — gives AI "eyes" to see what was rendered |
| `monorail_primitives` | Low-level design: create frames, text, shapes from scratch |

---

## What's Next

**Session 32:** Tech debt resolved (primitives in TypeScript), background layering fixed (`op: "background"`), deck name in pull, text alignment.

**Remaining quick wins:**
- [x] Simpler arrows — DONE (Session 32). Use `line` with `endCap: "ARROW_EQUILATERAL"`
- [x] Multi-point paths — DONE (Session 32). `path` op with `smooth` curves
- [ ] Image placeholder ("image goes here" frame)

**Discovery needed:**
- [ ] Diagram primitives — higher-level abstractions for timelines, flowcharts (see `docs/discovery/diagram-primitives.md`)

### Immediate (Next Session)

- [x] **TECH DEBT: Port primitives to TypeScript** — DONE (Session 32). Handler now in `code.ts`, safe to rebuild.

- [ ] **Primitives Rev 2** — Fill gaps discovered in Session 29 + 30 + 31:
  - [x] Hex color parsing — DONE (Session 32)
  - [x] Text alignment (center, right) — DONE (Session 32)
  - [x] Background operation — DONE (Session 32). Use `op: "background"` instead of rect.
  - [x] Gradient backgrounds — DONE (Session 32). Linear and radial via `gradient` property.
  - [x] Simpler arrows — DONE (Session 32). Use `line` with `startCap`/`endCap` (ARROW_EQUILATERAL, etc.)
  - [ ] Image placeholder — "image goes here" frame
  - DEFER: Image backgrounds (see `docs/discovery/background-fills.md`)
  - DEFER: Icons (needs component library integration, bigger lift)

- [x] **Pull improvements** — Session 31 friction: (Session 33)
  - [x] Add `slide_id` filter to `monorail_pull` — get just one slide's elements
  - [x] Summary mode — slide IDs + names without full element trees
  - (Deck name already fixed in Session 32)

- [x] **Patch delete debugging** — Session 33: Not a bug. Delete handler works correctly. Failures were due to stale IDs (slide recreated → new IDs). Added actionable error messages guiding to pull fresh IDs.

- [ ] **Template Library Resource** — `monorail://templates` listing available templates with metadata
  - Open: Where do templates live? (Dedicated Figma page? Plugin storage?)
  - Open: How is metadata stored? (File naming? Figma plugin data?)
  - Open: How does Claude browse/search?

### Foundational Work (Circle Back Soon)

These are infrastructure improvements that compound but aren't blocking current work:

- [ ] **Multi-deck awareness** — show which Figma file is active (Priority 3)
- [ ] **AI Guardrails** — lock modes to prevent accidental damage (Priority 3)
- [ ] **Shape round-tripping** — preserve manual diagram edits on re-push
- [ ] **Clone workflow docs** — document "design once, clone many" pattern

**When to do foundational work:** After template library ships. The library will drive more usage, which will expose which foundational issues actually matter.

### Completed (Archive)

<details>
<summary>Dogfood Fixes (all done)</summary>

- [x] **Push modes** — `mode: "replace" | "append"` (Session 17)
- [x] **Three-column archetype** — `position-cards` (Session 18)
- [x] **Capture → Clone workflow** — (Session 19)
- [x] **Configurable capture depth** — `max_depth` param (Session 19)
- [x] **Capture by slide ID** — (Session 19)
- [x] **Font fallback for patches** — (Session 19)
- [x] **Video/embed archetype** — (Session 23)
- [x] **Add elements to slides** — `action: "add"` (Session 27)
- [x] **Delete elements** — `action: "delete"` (Session 28)
- [x] **Primitives tool** — `monorail_primitives` (Session 29)
- [x] **Design principles** — Added to skill doc (Session 29)
- [~] **Simpler three-column** — SKIP, primitives can do it (Session 29 learning)

</details>

### Priority 2: Figma Best Practices
- [x] **Auto Layout for all archetypes** — title, quote, summary, section now use containers (Session 23)
- [x] **Fix two-column archetype** — Now uses nested Auto Layout containers (Session 22)
- [x] ~~Archetype detection~~ — Frame-based detection (Session 17)
- [x] ~~Font fallback chain~~ — Inter → SF Pro → Helvetica → Arial (Session 17)

### Priority 3: Trust & Transparency
- [ ] Multi-deck awareness — show which file is active, or warn if ambiguous
- [ ] Better push error messages — which slide, which field failed
- [ ] **AI Guardrails** — protection modes to prevent accidental damage:
  - `lock: "structure"` — AI can edit text, but can't add/delete/reorder slides
  - `lock: "content"` — AI can't modify this slide at all (read-only)
  - `lock: "delete"` — prevent slide deletion (but allow edits)
  - Deck-level protection — prevent `mode: "replace"` from wiping entire deck
  - Confirmation prompts for destructive operations
- [ ] **Context-aware plugin** — plugin adapts based on which slide you're viewing:
  - Show current slide info in plugin UI
  - Quick actions relevant to selected slide
  - "Protect this slide" toggle in UI
  - Visual indicator of slide lock status

### Priority 4: Polish (LOW)
- [x] Eyebrow text — implemented in `position-cards` archetype (Session 18)
- [ ] Clone workflow docs — document "design once, clone many" pattern
- [ ] Role mapping — use semantic roles instead of node IDs
- [x] Shared types — extract to `shared/types.ts`, import in both plugin/server (Session 26)
- [ ] Auto-generate MCP resources — derive from ARCHETYPES object
- [x] **esbuild for plugin** — bundler set up, targets ES2017 for Figma compatibility (Session 26)
- [ ] **Split plugin into modules** — SKEPTICAL. Modules extracted to `src/` but not wired up. The 3,400-line `code.ts` works fine and AI can grep/read sections. If you hit friction caused by file size, flag it here and reconsider. Otherwise, leave it.

### Priority 5: Visual Richness
- [x] **SVG support in IR** — `visual: { type: "svg", content: "..." }` with `createNodeFromSvg()`. Works but quality is poor — text wrapping unpredictable, positioning blind. (Session 21)
- [x] **Native diagram DSL** — `visual: { type: "cycle", nodes: [...], colors: [...] }`. Plugin renders with native Figma shapes. **Works well** — proper text, clean circles, correct colors. (Session 21)
- [x] **Smart sizing defaults** — Right=65%, Center=70%, Below=40%×35% of slide dimensions. (Session 21)
- [ ] **Placeholder frames** — Mark "visual goes here" in IR, renders as labeled placeholder in Figma. User fills in manually.
- [ ] **More diagram types** — funnel, timeline, 2x2 matrix, org chart. Same DSL approach as cycle.
- [ ] **Icon component library** — Use Figma's built-in Heroicons library (outline + solid) via `importComponentByKeyAsync()`. Programmatic shapes don't look good. Figma also has "Diagrams by Figma" library worth exploring. (Session 21 discovery)

**Key insight (Session 21):** Diagrams need a **dedicated mode**. Mixing diagram design into deck iteration breaks flow. Build deck structure first (fast), design diagrams later (focused).

### Discovery Needed
- [x] **Can Claude design?** — YES. 75-95% quality with primitives. Screenshot feedback loop essential. (Session 29)
- [x] **Design principles** — Added to `monorail://skill` resource. Spatial guidelines, typography, self-critique checklist. (Session 29)
- [ ] **Template Library** — Where do templates live? How is metadata stored? How does Claude browse? (Next session)
- [ ] **AI Developer Experience (AI DX)** — Tool descriptions, workflow hints, error recovery. See `docs/discovery/ai-dx.md`
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

### Session 34 (2026-01-15)
**Design Principles: 24px Minimum + Vertical Zone Planning + Copy Slide Reference**

Deep dive into AI design quality. User manually refined a GRAVITY slide, then we analyzed the delta to extract learnable principles.

**Part 1: 24px Minimum Font Size**
- Established hard rule: Nothing below 24px. Ever.
- If text seems too large, edit the copy shorter instead of shrinking font
- Updated typography scale in skill doc — Caption/Eyebrow now 24px (was 14-18px)

**Part 2: Text-in-Box Pattern**
- Added `verticalAlignment` property to text ops: `"TOP" | "CENTER" | "BOTTOM"`
- Added explicit `width` + `height` for text (fixed box mode)
- Pattern: Bind text dimensions to container dimensions + center alignment
- Text can't escape because its bounds ARE the box bounds

**Part 3: Vertical Zone Planning (the big unlock)**
- First attempt at slide recreation crammed content into top half, bottom third empty
- **Unlock:** Plan vertical zones BEFORE placing elements
- Standard 4-zone layout:
  - Zone 1 (y=50-180): Title
  - Zone 2 (y=200-650): Main content — cards, diagrams
  - Zone 3 (y=670-830): Secondary — callouts
  - Zone 4 (y=850-1000): Takeaway — anchors the bottom
- Size elements to FILL their zone, not just fit content
- Added to self-critique checklist: "Does content span top to bottom?"

**Part 4: Plugin DX — Copy Slide Reference**
- Problem: Hard to communicate which slide user is looking at
- Added "📋 Copy Slide Reference" button to plugin UI
- Copies `Slide: "Name" (ID)` format
- User can paste to tell Claude exactly which slide to work on

**Other principles codified:**
- Word economy — "Ship utility" not "Ship something real"
- Cards use sparingly — don't decorate, group
- Trust the background — don't add rects unless grouping

**Files changed:**
- `figma-plugin/code.ts` — `verticalAlignment`, fixed text box mode, get-slide-reference handler
- `figma-plugin/ui.html` — Copy Slide Reference button + clipboard handling
- `src/index.ts` — Design principles (24px min, text-in-box, vertical zones, self-critique checklist)

---

### Session 33 (2026-01-15)
**Pull Improvements: slide_id Filter + Summary Mode**

Addressed Session 31 friction where 20-slide decks produced 8,500+ lines of pull output.

**What we built:**

1. **`slide_id` parameter** — Pull just one slide's data. Returns filtered IR with only that slide and its containers.
   ```
   monorail_pull({ slide_id: "9:700" })
   → Just that slide's elements, not the whole deck
   ```

2. **`mode: "summary"` parameter** — Compact table of slide IDs, names, and archetypes. No element trees.
   ```
   monorail_pull({ mode: "summary" })
   | #  | Figma ID | Name        | Archetype |
   |  1 | 9:666    | GTM Kickoff | title     |
   ...
   ```

3. **Progressive disclosure tips** — Large decks (10+ slides) now show a tip suggesting summary mode first.

**AI DX applied:**
- Tool description explains "when to use" each mode (not just "what it does")
- Error messages guide recovery: "Use mode:'summary' to see available slide IDs"
- Response format self-documenting with tips

**Files changed:**
- `src/index.ts` — Tool schema (2 new params), handler with filtering logic
- `docs/references/mcp-tools.md` — Updated with examples for all three modes

**Note:** Deck name fix was already done in Session 32, no additional changes needed.

**Part 2: Patch Delete Debugging**

Investigated Session 31 delete failures. **Not a bug** — delete handler works correctly. Failures were due to stale IDs (slide recreated → new IDs → old IDs invalid).

Fix: Improved error messages with actionable guidance:
```
⚠️ Failed: 17:1849, 17:1850
   Node IDs may be stale. Try: monorail_pull to get fresh IDs, then retry.
   Common causes: slide was recreated, elements were deleted, or wrong slide targeted.
```

This is AI DX, not a code fix — guide Claude to pull fresh IDs before patching.

---

### Session 32 (2026-01-15)
**Tech Debt: Port Primitives to TypeScript + Background Fix + Deck Name**

Resolved critical tech debt and two dogfood friction points.

**Part 1: Port Primitives to TypeScript**
- Investigated how source got out of sync (Session 30 patched code.js during dogfood, deleted code.ts stub)
- Ported full `apply-primitives` handler (~280 lines) from `code.js` to `code.ts`
- Added `PrimitiveOperation` TypeScript interface with all operation types
- Included hex color parsing fix (`#1a1a2e` → RGB)
- Bonus: Added text alignment support (`alignment: 'LEFT' | 'CENTER' | 'RIGHT'`)

**Part 2: Background Operation (Solid + Gradient)**
- Problem: Using `rect` for backgrounds layered ON TOP of slide's native background
- Solution: Added `op: "background"` operation that sets slide's native background
- Supports solid colors: `{ "op": "background", "fill": "#0f0f1a" }`
- Supports linear gradients: `{ "op": "background", "gradient": { "angle": 90, "stops": [...] } }`
- Supports radial gradients: `{ "op": "background", "gradient": { "type": "radial", "stops": [...] } }`
- AI DX: Added clear guidance in tool schema and skill doc ("Never use rect for backgrounds")
- Discovery: `docs/discovery/background-fills.md` for image backgrounds (future work)

**Part 3: Simpler Arrows**
- Added `startCap` and `endCap` properties to `line` operation
- Independent start/end control via VectorNetwork per-vertex caps
- Caps: `ARROW_EQUILATERAL`, `ARROW_LINES`, `TRIANGLE_FILLED`, `DIAMOND_FILLED`, `CIRCLE_FILLED`
- Example: `{ "op": "line", "length": 150, "endCap": "ARROW_EQUILATERAL" }` → single-direction arrow

**Part 4: Multi-Point Paths**
- New `path` operation for complex shapes and connectors
- `points` array — any number of {x, y} coordinates
- `smooth: true` — auto-generate bezier curves (Catmull-Rom style)
- `closed: true` — connect last point to first (for shapes)
- Supports `startCap`/`endCap` for arrow decorations
- Example: `{ "op": "path", "points": [...], "smooth": true, "endCap": "ARROW_EQUILATERAL" }` → curved connector

**Part 5: Dogfood + Discovery**
- Tested on real "Blocking Chain" timeline slide
- Created curved flow versions (wave, j-curve, hockey-stick)
- **Finding:** Low-level primitives are powerful but coordinate math is tedious
- **Gap:** Dots don't align with curves without calculating bezier positions
- **Discovery doc:** `docs/discovery/diagram-primitives.md` — explores higher-level abstractions (timeline op, curve helpers, template approach)

**Part 3: Deck Name in Pull**
- Fixed: `monorail_pull` now returns actual Figma filename instead of "Pulled Deck"

**Files changed:**
- `figma-plugin/code.ts` — Primitives handler + `background` operation (solid + gradient) + deck name fix
- `src/index.ts` — Tool schema with gradient config, skill doc with examples
- `docs/discovery/background-fills.md` — NEW: Discovery for image backgrounds

**Verified:** Both plugin and server build clean

---

### Session 30 (2026-01-14)
**Dogfood: GTM Operating Canvas → 4-Slide System**

Deep dogfood session building a real GTM operating system for Keycard.

**What we built:**
1. **Position slide** — The Window, The Claim, The Engine, Dual Motion
2. **This Week slide** — ONE question, learning hypotheses, shipping list
3. **Scoreboard slide** — Critical path status, what moved, blockers
4. **Plan slide** — Q1 rhythm (Jan/Feb/Mar), ownership table

**Key insight:** "One slide = one conversation." Packing strategy + tactics + plan onto one canvas makes it unusable. Each slide should answer ONE question at ONE cadence.

**Friction discovered:**
1. **Background layering** — Primitives added bg rect on top of slide's existing background
2. **Hex colors not parsing** — `#1a1a2e` defaulted to white (fixed in code.js)
3. **Arrows are vector paths** — More complex than needed for simple connectors
4. **Tech debt** — Primitives handler only in code.js, not code.ts (out of sync)
5. **Debug workflow** — Screenshots don't reveal color issues; need capture/pull to verify

**What worked well:**
- Hex color fix made primitives immediately usable for dark-themed canvases
- 80 elements rendered correctly once colors worked
- Screenshot feedback loop caught layout issues
- Iterating on slide structure (1→4 slides) was fast

**Files changed:**
- `figma-plugin/code.js` — Added hex color parsing to `resolveColor()`
- `docs/failures.md` — 5 new entries documenting session friction
- `PLAN.md` — Updated immediate items, added session log

**Next:** Port primitives handler to code.ts, add simpler arrow option, fix background layering

---

### Session 29 (2026-01-13)
**Discovery: Primitives Tool + Design Principles + Dogfood**

Three parts this session:

**Part 1: Built `monorail_primitives` Tool**

New MCP tool (#10) for low-level slide design. Operations: frame, auto_layout_frame, text, rect, ellipse, line. Colors can be named or RGB.

**Part 2: Design Principles Added to Skill Doc**

Comprehensive spatial guidelines added to `monorail://skill`:
- Positioning patterns (centered vs top-anchored vs split)
- Typography scale (96px hero → 16px caption)
- Spacing rules (section gaps, card padding)
- Self-critique checklist (verify after screenshot)

**Part 3: Dogfood — GTM Operating Canvas**

Built 13 slides from an HTML operating canvas mockup. Key findings:

| Approach | Slides | Speed | Quality |
|----------|--------|-------|---------|
| Archetypes | 9 | ⚡ Fast (batch) | 90% |
| Primitives | 4 | Slower (1 per call) | 85% |

**Workflow that emerged:**
- Archetypes for content-first slides (bullets, quotes, two-column)
- Primitives for layout-first slides (timeline, competitive grid, status cards)
- Screenshot to verify complex layouts
- Design principles eliminated need for iteration on most slides

**Template candidates identified:**
- Timeline row (4 month cards)
- Competitive grid (3 competitors + edge callout)
- Status cards (color-coded by state)
- Split panel (left label + right content)

**Gaps confirmed:**
- Icons (need component library)
- Dense grids (9+ items)
- Textures/patterns
- Badges/pills

**Key insight:** Primitives + Templates is the right architecture. Primitives for first drafts and exploration, templates (capture/clone) for repeatable production quality.

**Files changed:**
- `figma-plugin/code.ts` — `apply-primitives` handler, `PrimitiveOperation` type
- `figma-plugin/ui.html` — WebSocket relay for primitives
- `src/index.ts` — `monorail_primitives` tool + design principles in skill resource
- `docs/decisions/template-first-architecture.md` — marked VALIDATED
- `PLAN.md` — session log, updated roadmap

**Tool count:** 9 → 10

**Primitives ceiling:** ~75-80% on complex slides. The last 20% needs:
- Icons (component library)
- Connectors/arrows (arrow heads)
- Patterns/textures (fills)
- Iteration via screenshot feedback loop

**Improving over time — options discussed:**
1. Template library (MCP resource) — low effort, high leverage
2. Design principles in skill doc — soft guidance for spacing/positioning
3. Self-critique loop — screenshot → evaluate → fix
4. Few-shot references — pull similar templates before designing
5. Vector DB — semantic search for templates (overkill for now)

**Tool count:** 9 → 10

### Session 28 (2026-01-13)
**Delete Elements + Template-First Architecture Direction**

Two parts this session:

**Part 1: Delete Elements**
Extended `monorail_patch` with `action: "delete"` to complete the add/edit/delete trifecta.

- Added `'delete'` to action enum in `ElementPatch`
- Delete logic in `applyPatches()`: get parent info, call `node.remove()`, Auto Layout reflows automatically
- Returns `deleted` count and `deletedElements` array with id/name/container
- Safety: warns if deleting the last child in a container (but allows it — Figma has undo)

**Example:**
```
monorail_patch({ changes: [{ target: "4:601", action: "delete" }] })
→ "✓ Patched: 1 deleted"
→ Deleted elements: bullet-2 (4:601) from bullets-container
```

**Part 2: Architecture Discussion → Template-First Direction**

Questioned whether current architecture is optimal. Key insights:

1. **Archetypes as constraints may limit creativity** — word limits help clarity but constrain expression
2. **Templates should be first-class** — not just "captured slides" but intentional, documented designs
3. **Primitives could enable Claude to design** — if Claude can create good-looking slides from scratch, archetypes become guidance not constraints
4. **Same tools, different mindset** — template definition vs content rendering don't need separate workflows

**Direction documented:** `docs/decisions/template-first-architecture.md`

Key shifts proposed:
- Archetypes → soft guidance in skill doc (not hardcoded layouts)
- Templates → primary workflow (capture/clone, not push)
- Primitives → exposed as tools (for design from scratch)
- IR → reduced role (Figma designs are source of truth)

**Open question:** Can Claude design well? Need to spike and test before committing.

**Files changed:**
- `shared/types.ts` — `DeletedElement` type, `deleted`/`deletedElements` in `PatchResult`
- `figma-plugin/code.ts` — delete logic in `applyPatches()`
- `figma-plugin/ui.html` — relay `deleted`/`deletedElements` fields
- `src/index.ts` — tool schema (3 actions), handler response
- `docs/decisions/template-first-architecture.md` — NEW: direction document
- `PLAN.md` — skepticism note on plugin refactor

**Ready to test:** Delete feature builds. Restart Cursor, reconnect Figma plugin.

### Session 27 (2026-01-13)
**Add Elements to Auto Layout Containers + AI DX**

Closed the CRITICAL gap: Claude can now add bullets/items without destroying human edits.

**Part 1: Add Elements Feature**
- Extended `monorail_patch` with `action: "add"` parameter
- Target a container ID (e.g., `bullets-container`) instead of text node
- New element inherits styling from existing siblings (font, size, color, width)
- Auto Layout handles positioning automatically — no Y calculation needed
- Returns new element ID for subsequent edits

**Part 2: AI DX — Container Discovery**
After building the feature, we realized Claude couldn't discover which containers support adding! Fixed by:
- `monorail_pull` now returns a `containers` array listing Auto Layout frames
- Each container shows: id, name, slide context, child count, element type, and usage hint
- Pull output now starts with a summary highlighting addable containers

**Example workflow:**
```
1. monorail_pull
   → "bullets-container (4:599) - 3 bullets in 'Key Benefits'"
   
2. monorail_patch({ changes: [{ target: "4:599", text: "• New point", action: "add" }] })
   → "✓ Patched: 1 added"
```

**Scope (intentionally narrow):**
- ✅ Works for simple text containers (bullets-container, items-container)
- ❌ Does NOT work for compound elements (cards, columns, timeline stages)
- Future: clone sibling subtree + content map for complex structures

**Files changed:**
- `figma-plugin/code.ts` — `applyPatches()` + `findAddableContainers()`
- `figma-plugin/ui.html` — relay `added`/`newElements` fields
- `src/index.ts` — tool schema, pull response with container summary
- `shared/types.ts` — `AddableContainer` type, `DeckIR.containers`

**Key learning:** Building a feature isn't enough — must ensure AI can discover how to use it. "AI DX" = can Claude figure out the right tool call without human help?

**Tested:** Full workflow validated — pull discovered containers, add bullet worked, screenshot confirmed. 

**Next:** `action: "delete"` planned for future session (design notes in "What's Next").

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

**Modular Plugin Structure (WIP):**
- Created `figma-plugin/src/` with extracted modules:
  - `constants.ts` — colors, dimensions (30 lines)
  - `fonts.ts` — font fallback chain (72 lines)
  - `primitives.ts` — addText, addRect, createAutoLayoutFrame (166 lines)
  - `archetypes.ts` — slide rendering by archetype (571 lines)
  - `diagrams.ts` — cycle/icon rendering (437 lines)
  - `update.ts` — patch and update logic (254 lines)
  - `index.ts` — barrel file
- Original `code.ts` preserved (3,482 lines)
- Modules compile but not wired up yet
- **Next step:** Write tests against `code.ts`, then safely refactor to use modules

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

**Read first:** PLAN.md (current state, priorities, session 29 learnings)

**What works now:**
- 10 MCP tools, 11 archetypes
- **Primitives tool** — `monorail_primitives` creates slides from scratch (frames, text, shapes)
- **Design principles** — spatial guidelines, typography scale, self-critique checklist in skill doc
- **Screenshot feedback** — `monorail_screenshot` gives AI "eyes" to see and iterate
- Full CRUD: pull/push/patch (add/edit/delete)/clone/capture

**Architecture direction (Session 29):**
- Primitives = drafts (75-95% quality)
- Archetypes = speed (constrained content)
- Clone = production (100% fidelity)
- Design principles compound — every primitives call benefits

**Immediate priorities:**

**Option A: Template Library Resource**
Create `monorail://templates` listing captured templates with metadata.
- Open: Where do templates live? Dedicated Figma page?
- Open: How is metadata stored? Plugin data? File naming?
- Open: How does Claude browse/search?

**Option B: Primitives Rev 2**
Fill gaps discovered in Session 29:
- Text alignment (center, right) — quick win
- Arrow heads on lines — enables connectors
- Image placeholder frames
- DEFER: Icons (needs component library, bigger lift)

**Option C: Foundational Work**
Circle back to infrastructure:
- Multi-deck awareness (which file is active?)
- AI Guardrails (lock modes to prevent damage)
- Shape round-tripping (preserve manual edits)

**When to do foundational:** After template library. More usage will reveal which issues actually matter.

**Key insight (Session 29):**
Design principles > more archetypes. Principles compound, archetypes are O(n) work for O(1) benefit.

**Key files:**
- `figma-plugin/code.ts` — plugin (3,500 lines)
- `src/index.ts` — MCP tools + skill/archetypes resources
- `shared/types.ts` — shared TypeScript types
- `docs/decisions/template-first-architecture.md` — architecture direction
```
