# MCP Tools Reference

> The 14 tools Claude uses to collaborate on designs via Figma.

---

## Core Loop: pull > patch

The main workflow is **read what's there, update specific elements**. This preserves human styling and layout.

```
1. monorail_pull   — see all slides and elements with IDs
2. monorail_patch  — update specific text by node ID
3. (repeat)
```

---

## Connection

### `monorail_status`
Check if the Figma plugin is connected.

```
Returns: Connection state, plugin name/version, timestamp, current selection
```

---

## Deck Operations

### `monorail_pull`
Get current deck state from Figma. Supports three modes for different use cases.

```
Parameters:
- slide_id?: string — Pull only this slide (by Figma node ID). Returns filtered data.
- mode?: "full" | "summary" — Output mode:
  - "full" (default): Complete element data for all slides
  - "summary": Just slide IDs, names, archetypes (compact overview)

Returns:
- deck.title — Actual Figma filename
- slides[].elements[] — ALL text elements with Figma node IDs (for editing)
- slides[].has_diagram — true if complex nested content
- slides[].figma_id — Figma node ID for the slide
- slides[].archetype — detected archetype (may be "unknown")
- containers[] — Auto Layout frames that support action:"add"
```

**Three modes:**

1. **Full deck** (default): All slides with elements. Use before bulk patching.
2. **Single slide** (`slide_id` param): One slide's full data. Use when you know which slide to edit.
3. **Summary** (`mode: "summary"`): Just slide IDs, names, archetypes. Use to see deck structure without element noise.

**Example: Summary mode (for large decks)**
```
monorail_pull({ mode: "summary" })

✓ Pulled "GTM Strategy" summary (8 slides)

| #  | Figma ID | Name                    | Archetype     |
|----|----------|-------------------------|---------------|
|  1 | 9:666    | GTM Kick-off            | title         |
|  2 | 9:700    | The Problem             | big-idea      |
| ...

Tip: Use slide_id param to pull full details for a specific slide.
```

**Example: Single slide (targeted patching)**
```
monorail_pull({ slide_id: "9:700" })

✓ Pulled slide "The Problem" (9:700)
  12 elements, 1 addable container

{ "deck": {...}, "slides": [/* just this slide */], ... }
```

---

### `monorail_push`
Create/replace slides in Figma from IR. Validates before sending.

```
Parameters:
- ir: string (JSON) — The deck IR
- mode?: "append" | "replace" — How to handle existing slides:
  - "append" (default): Add new slides after existing ones
  - "replace": Delete ALL existing slides first, then create new ones
- autoApply?: boolean — If true (default), renders immediately
- start_index?: number — Position to insert (0-based). Only applies in append mode.

Returns: Success message or validation errors
```

**Use when:** Bootstrapping a new deck or bulk updates. For surgical edits, prefer pull > patch.

**Replace mode:** Use `mode: "replace"` when rewriting an entire deck. This deletes all existing slides first, preventing the "11 old + 8 new = 19 slides" problem.

**Validation:** Blocks on errors (missing required fields, unknown archetypes). Warns on constraint violations (word limits exceeded).

---

### `monorail_patch`
Edit existing text, add new elements, or delete elements.

```
Parameters:
- patches.changes[]: Array of changes, each with:
  - target: string — Figma node ID (TEXT for edit, FRAME for add)
  - text: string — New text content (required for edit/add, ignored for delete)
  - action?: "edit" | "add" | "delete" — Default is "edit"
  - position?: number — For "add" only: insert position (-1 or omit = append)
```

**Three modes:**
1. **Edit (default):** Target a TEXT node ID > update its content
2. **Add:** Target a FRAME container ID (like `bullets-container`) with action:`add` > create new element
3. **Delete:** Target any element ID with action:`delete` > remove it

**Edit example:**
```json
{
  "patches": {
    "changes": [
      { "target": "9:144", "text": "Updated headline" },
      { "target": "9:147", "text": "Updated subline" }
    ]
  }
}
```

**Add example:**
```json
{
  "patches": {
    "changes": [
      { "target": "4:599", "text": "• New bullet point", "action": "add" }
    ]
  }
}
```

**Limitations:** `action: "add"` only works for simple text elements (bullets, items). For compound elements (cards, columns), use delete + push or clone.

---

### `monorail_clone`
Clone a slide and update its text content.

```
Parameters:
- source_slide_id: string — Figma node ID to clone (from capture)
- content_map?: object — { slot_id: "new text" }
```

**Use when:** Creating a new slide that matches an existing design. Preserves all styling, positioning, and structure.

---

## Visual

### `monorail_screenshot`
Export a slide as a PNG image. Gives the AI "eyes" to see what was rendered.

```
Parameters:
- slide_id?: string — Figma node ID of slide to export (optional, defaults to first slide)
- scale?: number — Export scale factor (default: 0.5 for 50% size)

Returns: PNG image (base64-encoded) with dimensions
```

**Use when:**
- Verifying layouts after push/patch
- Checking alignment and spacing
- Debugging visual issues
- QA before presenting to user

---

### `monorail_export`
Export any Figma node as SVG or PNG.

```
Parameters:
- node_id?: string — Figma node ID to export (omit to use current selection)
- format?: "SVG" | "PNG" — Export format (default: SVG)
- scale?: number — Scale factor for PNG only (default: 1)

Returns: SVG as UTF-8 string or PNG as base64, plus node name and dimensions
```

**Use when:** Exporting individual elements — vectors, components, icons. Unlike `monorail_screenshot` (slide-level PNG), this targets any node and supports SVG output.

---

### `monorail_css`
Extract CSS and raw paint data from a Figma node.

```
Parameters:
- node_id?: string — Figma node ID (omit to use current selection)

Returns: Figma's getCSSAsync() output (same as "Copy as CSS")
  plus raw fills, strokes, effects with gradient data and blend modes
```

**Use when:** Design-to-code translation. Extracting exact visual properties (colors, gradients, shadows, border radius) from existing Figma elements.

---

### `monorail_primitives`
Low-level design tool for creating slide content from scratch.

```
Parameters:
- slide_id?: string — Existing slide to add elements to (omit to create new slide)
- operations: array — Primitive operations applied in sequence

Operations:
- background — Slide background (solid fill or gradient)
- frame — Basic frame container
- auto_layout_frame — Frame with Auto Layout
- text — Text element (fontSize, bold, color, maxWidth)
- rect — Rectangle (fill, stroke, cornerRadius)
- ellipse — Ellipse/circle
- line — Simple line with optional cap decorations
- path — Multi-point path (smooth curves, closed shapes)
- arrow — Directional arrow (up/down/left/right, bidirectional)

Each operation supports: name, parent (for nesting), x, y, width, height,
color/fill/stroke, gradient (for backgrounds). Operations can reference
earlier operations by name for parent-child relationships.
```

**Use when:** Building custom layouts without archetypes, creating diagrams, adding design elements that don't fit standard slide templates.

**Example: Simple layout**
```json
{
  "operations": [
    { "op": "background", "fill": "#1a1a2e" },
    { "op": "text", "text": "Custom Slide", "fontSize": 48, "bold": true, "color": "white", "x": 100, "y": 100 },
    { "op": "rect", "x": 100, "y": 200, "width": 400, "height": 300, "fill": "#16213e", "cornerRadius": 16 }
  ]
}
```

---

## Discovery

### `monorail_find`
Search for nodes by type and/or name.

```
Parameters:
- type?: string — Node type filter ("COMPONENT", "INSTANCE", "VECTOR", "TEXT", "FRAME")
- name?: string — Name filter (substring match, case-insensitive)
- parent_id?: string — Scope search to descendants of this node
- limit?: number — Maximum results (default: 20, max: 100)

Returns: Array of { id, name, type, x, y, width, height, parent } for each match
```

**Use when:** Discovering elements in the document — finding components, text nodes, vectors, or frames by name or type. Start broad, then narrow with `parent_id`.

---

### `monorail_component`
Get component info for a Figma node.

```
Parameters:
- node_id?: string — Figma node ID (omit to use current selection)

Returns: Main component details, variant properties, component set info,
  and sibling variants with their property values
```

**Use when:** Understanding component structure. Works on instances (returns source component), components, and component sets. Useful for finding variant options before cloning or pushing.

---

### `monorail_capture`
Capture full structure of a slide.

```
Parameters:
- slide_id?: string — Figma node ID to capture (optional, defaults to selected slide)
- max_depth?: number — Nesting depth for editable slots (default: 2, increase for complex slides)

Returns:
- slide_id, slide_name, dimensions
- design_system: { colors, fonts, spacing, corners }
- slots[]: { id, role, text, bounds } — editable text nodes
- complex_regions[]: diagrams/charts (deeper than max_depth)
- stats: node counts, max_depth_used
```

**Use when:** Analyzing an existing slide before cloning, or extracting design tokens.

**Tip:** If important content appears in `complex_regions`, re-capture with higher `max_depth` (3 or 4).

---

## Deck Management

### `monorail_delete`
Delete slides from the deck by Figma node ID.

```
Parameters:
- slide_ids: string[] — Array of Figma node IDs (from figma_id in pull output)

Returns: Count of deleted slides, list of failures
```

**Use when:** Removing slides that are no longer needed. This is destructive — slides are permanently removed.

---

### `monorail_reorder`
Reorder slides in the deck to match a specified order.

```
Parameters:
- slide_ids: string[] — Array of Figma node IDs in desired order

Returns: Success/failure with count
```

**Use when:** Rearranging the slide order. All slides you want to keep must be included in the array.

---

## Workflow Patterns

### Edit existing content (most common)
```
1. monorail_pull        — see all elements with IDs
2. monorail_patch       — update specific text
3. (repeat as needed)
```

### Bootstrap new deck
```
1. monorail_push with IR  — creates slides from archetypes
2. monorail_pull          — get element IDs
3. monorail_patch         — refine content
```

### Clone with variations
```
1. monorail_capture       — get slide structure + slot IDs
2. monorail_clone         — create copy with new content
```

### Visual QA
```
1. monorail_push          — create/update slides
2. monorail_screenshot    — see the result as an image
3. (iterate if needed)
```

### Design-to-code extraction
```
1. monorail_find          — locate the element by type/name
2. monorail_css           — get exact CSS properties
3. monorail_export        — export as SVG or PNG
```

### Custom slide design
```
1. monorail_primitives    — build layout from scratch (frames, text, shapes)
2. monorail_screenshot    — verify the result
3. (iterate)
```

### Component exploration
```
1. monorail_find          — find components by type/name
2. monorail_component     — inspect variant properties
3. monorail_clone         — use as basis for new slides
```

### Extract design system
```
1. monorail_capture       — returns colors, fonts, spacing
2. Use tokens for consistency in new content
```

### Delete slides
```
1. monorail_pull          — get slide IDs (figma_id field)
2. monorail_delete        — remove unwanted slides
```

### Insert at position
```
1. monorail_pull          — see current order
2. monorail_push with start_index — insert at specific position (append mode)
```

### Replace entire deck
```
1. monorail_push with mode: "replace" — deletes all existing, creates new
```

### Reorder deck
```
1. monorail_pull          — get all slide IDs
2. monorail_reorder       — pass IDs in desired order
```

### Add bullet/item to existing slide
```
1. monorail_pull          — get container IDs from containers array
2. monorail_patch with action: "add" — append new element
   { target: "container-id", text: "• New bullet", action: "add" }
```
