# Architecture Review Discovery

> Session 14 — Post-dogfooding reflection
> **Session 15 — Tool consolidation COMPLETE (14 → 6)**

## Current State

**Codebase:**
- `src/index.ts` — ~2000 lines (MCP server, 6 tools, WebSocket)
- `figma-plugin/code.ts` — 1830 lines (plugin, archetypes, export/apply)

**MCP Tools (8):** ✅ Consolidated in Session 15, expanded in Session 16
| Tool | Purpose |
|------|---------|
| `monorail_status` | Check plugin connection |
| `monorail_pull` | Get deck state (slides, elements, IDs) |
| `monorail_push` | Create/replace slides (with inline validation, optional `start_index`) |
| `monorail_patch` | Update specific text by node ID |
| `monorail_capture` | Full structure + design system + slots |
| `monorail_clone` | Clone slide + update content |
| `monorail_delete` | Delete slides by Figma node ID |
| `monorail_reorder` | Reorder slides to match specified order |

**Plugin Message Types:** (unchanged)
- `apply-ir` — Render slides from IR
- `export-ir` — Export slides to IR
- `patch-elements` — Update text nodes
- `capture-template` — Get node tree
- `instantiate-template` — Clone slide

---

## Pain Points Surfaced by Dogfooding

### 1. Monolithic Files
- Single ~2000-line MCP server (improved from 3000)
- Single 1800-line plugin
- *Defer: Split when painful, not preemptively*

### 2. Inconsistent Layout Strategies
- `bullets` uses Auto Layout ✅
- `big-idea` uses Auto Layout ✅ (fixed Session 14)
- `title`, `quote`, `summary` still use fixed positions ← **NEXT**
- `timeline` creates shapes procedurally

### 3. ~~Tool Sprawl~~ ✅ RESOLVED (Session 15)
- ~~14 tools, some rarely used~~
- Now 8 tools with clear purposes
- Validation inlined, extract tools merged into capture

### 4. Missing Capabilities
- ~~No slide positioning/ordering~~ ✅ DONE (Session 16)
- No element repositioning (only text updates)
- No shape/arrow creation from MCP
- No design system application on push

### 5. Round-Trip Fidelity
- Write works, read doesn't recognize (bullets → "unknown")
- Archetype detection is heuristic-based, fragile
- *Consider: Claude should do detection, plugin just reports elements*

---

## Architecture Options

### Option A: Status Quo + Incremental Fixes
**Approach:** Keep current structure, fix specific gaps
- Add slide positioning to push_ir
- Fix archetype detection
- Add Auto Layout to remaining archetypes

**Pros:** Fast, low risk
**Cons:** Debt accumulates, files keep growing

### Option B: Modular Refactor
**Approach:** Split into modules, cleaner separation

**MCP Server:**
```
src/
  index.ts          — Server bootstrap, tool registration
  tools/
    deck.ts         — create, update, get, validate
    sync.ts         — push, pull, connection
    patch.ts        — patch_elements
    template.ts     — capture, extract, instantiate
    styled.ts       — create_styled_slide, design system
  ir/
    types.ts        — IR type definitions
    validation.ts   — Constraint checking
```

**Plugin:**
```
figma-plugin/
  code.ts           — Entry point, message routing
  layouts/
    title.ts
    bullets.ts
    big-idea.ts
    ...
  export/
    analyzer.ts     — Archetype detection
    elements.ts     — Element extraction
  apply/
    renderer.ts     — IR → Figma nodes
```

**Pros:** Maintainable, testable, easier to extend
**Cons:** Refactor cost, Figma plugin bundling complexity

### Option C: Rethink the Model
**Approach:** Question core assumptions

**Questions:**
1. Is IR the right abstraction? Or should we work more directly with Figma's model?
2. Should archetypes be predefined, or dynamically learned from templates?
3. Is "push whole deck" the right granularity, or should it be slide-by-slide?
4. Should the plugin be smarter (more logic) or dumber (thin relay)?

**Observations from dogfooding:**
- We rarely use `create_deck` — just `push_ir` directly
- Template capture → extract → instantiate is powerful but complex
- The "read what's there, patch specific elements" loop works well
- Design system extraction exists but isn't wired into push

---

## Key Questions to Answer

### 1. What's the core loop we're optimizing for?

**Answer from PLAN.md:** "Not 'generate and export' — a live loop where both parties work in the same canvas."

**Implication:** The core loop is:
```
Human edits in Figma
    ↓
Claude pulls (sees what changed)
    ↓
Claude patches specific elements
    ↓
Human sees changes, reacts
    ↓
(repeat)
```

**NOT:**
```
Claude generates full deck → Human receives → Done
```

This means:
- `pull_ir` + `patch_elements` are the **core tools**
- `push_ir` is for **bootstrapping** (create initial deck)
- Template tools are for **"make another like this"** moments
- We should optimize for **surgical updates**, not bulk overwrites

### 2. Where should intelligence live?

**Current:** Split awkwardly
- MCP server: IR validation, template extraction logic
- Plugin: Archetype rendering, element classification

**Better:** 
- **Plugin:** Dumb relay + Figma API expertise (rendering, reading)
- **MCP/Claude:** All intelligence (what to change, how to interpret)

The plugin shouldn't try to detect archetypes — Claude can do that better by looking at the elements.

### 3. What's the right tool granularity?

**Current 14 tools → Proposed 6 core tools:**

| Core Tool | Purpose |
|-----------|---------|
| `connection_status` | Check plugin alive |
| `pull` | Get current deck state (rich elements) |
| `push` | Create/replace slides (bootstrapping) |
| `patch` | Update specific elements by ID |
| `capture_template` | Get full structure of a slide |
| `create_from_template` | Clone + modify |

**Consolidate/Remove:**
- `create_deck`, `update_slides`, `get_deck` → internal state, not needed as tools
- `validate_ir` → inline validation
- `preview` → rarely used
- `extract_template`, `extract_design_system` → could be Claude-side logic on captured data

### 4. Do we need the IR abstraction?

**Partial yes.** IR is useful for:
- Bootstrapping a new deck quickly
- Validating structure

But for the core loop, we work with **Figma node IDs directly**:
- Pull gives us element IDs
- Patch targets specific IDs
- No IR translation needed

**Hybrid approach:**
- Keep IR for `push` (bulk create)
- Use raw element IDs for `patch` (surgical updates)

---

## Recommendation

### Clarity on Core Loop
The **pull → patch** loop is the product. Everything else supports it.

### ✅ DONE (Session 15):
1. ✅ Fix big-idea Auto Layout
2. ✅ **Consolidate tools:** 14 → 6 core tools

### Short-term (next sessions):
1. **Slide positioning** — insert at index, not just append (HIGH)
2. **Auto Layout** for title, quote, summary archetypes
3. **Simplify plugin archetype detection** — Claude interprets, plugin just reports

### Medium-term:
1. Font fallback chain (custom → similar → Inter)
2. Selective pull (filter by slide, summary mode)

### Defer:
1. Full Figma visual language (arrows, connectors, images)
2. Dynamic template learning
3. Design system auto-application

---

## Tool Surface (v2) ✅ IMPLEMENTED

```
CORE (daily use):
  monorail_status        — Is plugin connected?
  monorail_pull          — Get deck state (slides, elements, IDs)
  monorail_push          — Create/replace slides from IR (+ start_index)
  monorail_patch         — Update specific elements by ID

DECK OPERATIONS (Session 16):
  monorail_delete        — Delete slides by ID
  monorail_reorder       — Reorder slides

POWER (occasional use):
  monorail_capture       — Full structure + design system + slots
  monorail_clone         — Clone slide + update content
```

8 tools. Claude can do more with less.

---

## Next Steps

- [x] Tool consolidation (14 → 6 → 8)
- [x] Slide positioning (insert at index) — `start_index` on push
- [x] Slide delete — `monorail_delete`
- [x] Slide reorder — `monorail_reorder`
- [ ] Auto Layout for remaining archetypes
- [ ] Simplify plugin archetype detection
