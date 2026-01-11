# Monorail Figma Plugin: Specification

## Purpose

Write IR (deck spec) into Figma Slides. Enable the bidirectional loop where Claude proposes, human edits, Claude sees changes and adapts.

---

## Core Capabilities

### 1. Create slides from IR

Given a `deck.yaml` or `deck.json`, create corresponding slides in Figma Slides using the archetype component library.

### 2. Update existing slides

Given updated IR, modify only the slides that changed. Don't regenerate the whole deck.

### 3. Respect locking

Slides marked `status: locked` in the IR are not modified, even if their content in the IR differs from Figma.

### 4. Maintain ID mapping

Track which IR slide ID corresponds to which Figma frame ID. This enables partial updates and survives reordering.

---

## IR Format

```yaml
deck:
  title: "Decks That Land"
  
slides:
  - id: slide-1
    archetype: title
    status: draft          # draft | locked | stub
    content:
      headline: "Decks That Land"
      subline: "What if AI helped you find the argument?"
    speaker_notes: "Open with the question, not the answer."
    
  - id: slide-2
    archetype: bullets
    status: draft
    content:
      headline: "You've tried AI deck tools"
      bullets:
        - "They generate slides fast"
        - "The output looks professional"
        - "But something's missing"
    speaker_notes: "Pause after 'something's missing.'"
    
  - id: slide-3
    archetype: big-idea
    status: locked          # Won't be modified by plugin
    content:
      headline: "Pretty slides that don't land"
      subline: "The deck had information. It didn't have an argument."
    
  - id: slide-4
    archetype: chart
    status: draft
    content:
      headline: "Ticket volume is outpacing capacity"
      chart:
        type: line
        placeholder: true   # Plugin creates placeholder, human fills
      takeaway: "The lines cross in Q3 2026."
      
  - id: slide-5
    archetype: two-column
    status: draft
    content:
      headline: "Claude + Figma as shared canvas"
      left:
        title: "Claude writes"
        body: "Generates slides via plugin. Proposes structure."
      right:
        title: "You spike"
        body: "Edit directly in Figma. Claude sees it."
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable identifier. Survives reordering. |
| `archetype` | Yes | Which component to use. |
| `status` | Yes | `draft`, `locked`, or `stub`. |
| `content` | Yes | Archetype-specific content fields. |
| `speaker_notes` | No | Notes for presenter. |

### Status Values

| Status | Meaning | Plugin Behavior |
|--------|---------|-----------------|
| `draft` | In progress | Create or update |
| `locked` | Settled | Skip (don't modify) |
| `stub` | Placeholder | Create minimal, mark visually |

---

## Archetypes

Each archetype is a Figma component in the Monorail component library. Plugin instantiates the component and fills content fields.

### Title
```yaml
content:
  headline: string (≤8 words)
  subline: string (≤15 words, optional)
```

### Section
```yaml
content:
  headline: string (≤5 words)
```

### Big Idea
```yaml
content:
  headline: string (≤12 words)
  subline: string (≤20 words)
```

### Bullets
```yaml
content:
  headline: string (≤8 words)
  bullets: array[string] (max 3, each ≤10 words)
```

### Two-Column
```yaml
content:
  headline: string (≤8 words)
  left:
    title: string
    body: string
  right:
    title: string
    body: string
```

### Quote
```yaml
content:
  quote: string (≤30 words)
  attribution: string
```

### Chart
```yaml
content:
  headline: string (≤10 words, states the insight)
  chart:
    type: line | bar | pie | area
    placeholder: boolean    # If true, create empty chart area
    data: object (optional) # If provided, attempt to render
  takeaway: string (≤15 words)
```

### Timeline
```yaml
content:
  headline: string (≤8 words)
  stages: array[{label: string, description?: string}] (3-5 items)
```

### Comparison
```yaml
content:
  headline: string (≤8 words)
  columns: array[string] (2-4 column headers)
  rows: array[array[string]] (3-5 rows)
```

### Summary
```yaml
content:
  headline: string (≤8 words)
  items: array[string] (max 3, each ≤12 words)
```

---

## Plugin Architecture

### Runtime Environment

Figma Plugin (runs inside Figma's iframe sandbox).

### Input Methods

**Primary: WebSocket (Working ✅)**
- Plugin connects to MCP server on `ws://localhost:9876`
- Claude uses `monorail_push_ir` tool
- Server pushes to plugin via WebSocket
- Plugin applies automatically
- **No copy/paste required**

**Fallback: Manual paste**
- User copies IR from Claude
- Opens plugin, clicks "Paste IR" (collapsed in UI)
- Plugin parses and applies

The WebSocket bridge is the primary workflow. Manual paste exists as fallback when connection issues occur.

### Component Library

Plugin expects a component library with:
- 10 archetype components (title, section, big-idea, etc.)
- Consistent naming: `monorail/title`, `monorail/bullets`, etc.
- Text layers named to match content fields: `headline`, `subline`, `bullet-1`, etc.

Plugin ships with a default library. Users can duplicate and customize.

---

## Operations

### Create Deck

Input: IR with no existing mapping
Output: New Figma Slides deck

1. Create new Figma Slides document (or page)
2. For each slide in IR:
   - Instantiate archetype component
   - Fill content fields
   - Store mapping: `slide.id → figma.frameId`
3. Save mapping to plugin storage

### Update Deck

Input: IR with existing mapping
Output: Modified slides

1. Load mapping from plugin storage
2. For each slide in IR:
   - If `status: locked` → skip
   - If `id` exists in mapping:
     - Find Figma frame by stored frameId
     - Update content fields
   - If `id` not in mapping:
     - Create new slide
     - Add to mapping
3. Handle deletions:
   - Slides in mapping but not in IR → prompt user (delete? keep?)
4. Handle reordering:
   - Reorder Figma frames to match IR order
5. Save updated mapping

### Read Deck (for MCP integration)

Output: Current state as IR

1. Load mapping
2. For each slide in Figma:
   - Read content from text layers
   - Reconstruct IR structure
3. Return IR (for Claude to consume via MCP)

---

## ID Mapping

Stored in Figma's plugin data storage (per-document).

```json
{
  "version": 1,
  "mapping": {
    "slide-1": "figma-frame-id-abc123",
    "slide-2": "figma-frame-id-def456",
    "slide-3": "figma-frame-id-ghi789"
  },
  "lastUpdated": "2026-01-10T12:00:00Z"
}
```

If a Figma frame is deleted manually, mapping becomes stale. Plugin should detect and prompt for re-sync.

---

## Constraint Validation

Plugin validates content against archetype constraints before applying:

| Constraint | Behavior |
|------------|----------|
| Headline too long | Warn, apply anyway (let user see overflow) |
| Too many bullets | Warn, truncate to max |
| Missing required field | Error, skip slide |

Validation warnings appear in plugin UI, not as blocking errors. Let the human see the problem and fix it.

---

## UI Sketch

```
┌─────────────────────────────────────┐
│  Monorail                          [×]  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┐ ┌─────────────┐   │
│  │  Paste IR   │ │  Load File  │   │
│  └─────────────┘ └─────────────┘   │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Status: Ready                      │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Apply to Deck              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Warnings:                          │
│  • slide-4: headline exceeds 10w    │
│  • slide-7: 4 bullets, max is 3     │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Export Current Deck as IR  │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

---

## MCP Integration (Working ✅)

**Custom MCP server** (`src/index.ts`) communicates with plugin via WebSocket:

| Tool | Purpose |
|------|---------|
| `monorail_connection_status` | Check if plugin connected |
| `monorail_push_ir` | Send IR to plugin (optional `autoApply`) |
| `monorail_pull_ir` | Request export, wait for response, return IR |

**Note:** The official Figma MCP doesn't support Slides, and REST API is read-only. That's why we built WebSocket bridge.

### Example: Pull current deck

```typescript
// Claude calls:
monorail_pull_ir()

// Returns:
{
  "deck": { "title": "Decks That Land" },
  "slides": [
    {
      "id": "slide-1",
      "archetype": "title",
      "content": {
        "headline": "Decks That Land",
        "subline": "What if AI helped you find the argument?"
      }
    },
    {
      "id": "slide-5",
      "archetype": "bullets",
      "content": {
        "headline": "Key Points",
        "bullets": ["First", "Second", "Third"]
      },
      "extras": ["Footnote human added"]  // <-- Claude sees freeform additions
    }
  ]
}
```

---

## Answered Questions

| Question | Answer |
|----------|--------|
| Figma Slides vs. Design? | Works! Use `figma.createSlide()`, `slide.fills` for backgrounds |
| Component library? | Plugin renders directly (hardcoded positions) — no separate library needed |
| Chart rendering? | Placeholder text for v0 |
| Speaker notes? | Stored in IR only (not rendered to Figma) |
| WebSocket from plugin? | ✅ Works — iframe has full browser APIs |

## Open Questions (v1+)

1. **Concurrent editing** — Multiple people editing. How does mapping handle conflicts?
2. **Version control** — Should we store IR history? Undo support?
3. **Delete capability** — Plugin can't delete slides yet (orphans require manual cleanup)
4. **Visual feedback** — Claude can't see rendered output (overflow, layout issues)

---

## v0 Scope (Complete ✅)

### Implemented
- ✅ WebSocket bridge (push/pull without copy/paste)
- ✅ Create slides from IR (all 10 archetypes)
- ✅ Update existing slides (in-place, non-locked)
- ✅ ID mapping (IR id ↔ Figma frame id)
- ✅ Export current deck as IR
- ✅ Archetype detection from slide content
- ✅ Freeform handling (`extras` field for human additions)
- ✅ Manual paste fallback

### Out of scope (v1)
- Delete slides
- Chart data rendering (placeholder only)
- Concurrent edit handling
- Version history
- Custom archetype creation
- Auto Layout / Component templates

---

## See Also

- `docs/decisions/websocket-bridge.md` — WebSocket protocol design
- `docs/decisions/freeform-handling.md` — Update-in-place + extras
- `docs/failures.md` — Learnings and gotchas
