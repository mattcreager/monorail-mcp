# MCP Tools Reference

> The 9 tools Claude uses to collaborate on decks via Figma.

---

## Core Loop: pull → patch

The main workflow is **read what's there, update specific elements**. This preserves human styling and layout.

```
1. monorail_pull   — see all slides and elements with IDs
2. monorail_patch  — update specific text by node ID
3. (repeat)
```

---

## Tools

### `monorail_status`
Check if the Figma plugin is connected.

```
Returns: Connection state, plugin name/version, timestamp
```

---

### `monorail_pull`
Get current deck state from Figma, including addable containers.

```
Returns:
- slides[].elements[] — ALL text elements with Figma node IDs (for editing)
- slides[].has_diagram — true if complex nested content
- slides[].figma_id — Figma node ID for the slide
- slides[].archetype — detected archetype (may be "unknown")
- containers[] — Auto Layout frames that support action:"add"
  - id: Figma node ID (use as target for action:"add")
  - name: Container name (e.g., "bullets-container")
  - slide_id, slide_name: Which slide contains it
  - child_count: Current number of elements
  - element_type: "bullet" | "item" | "column"
  - hint: Usage guidance
```

**Use when:** Need to see what's on the slides before making changes. The `containers` array tells you where you can ADD new elements.

**Example output:**
```
✓ Pulled deck from Figma
  3 slides, 2 addable containers

## Addable Containers (use with action: "add")
  • bullets-container (4:599) - 3 bullets in "Key Benefits"
    Add bullet points with action:"add"
  • items-container (4:721) - 4 items in "Summary"
    Add summary items with action:"add"
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

**Use when:** Bootstrapping a new deck or bulk updates. For surgical edits, prefer pull → patch.

**Replace mode:** Use `mode: "replace"` when rewriting an entire deck. This deletes all existing slides first, preventing the "11 old + 8 new = 19 slides" problem.

**Validation:** Blocks on errors (missing required fields, unknown archetypes). Warns on constraint violations (word limits exceeded).

---

### `monorail_patch`
Edit existing text OR add new elements to Auto Layout containers.

```
Parameters:
- patches.changes[]: Array of changes, each with:
  - target: string — Figma node ID (TEXT for edit, FRAME for add)
  - text: string — New text content
  - action?: "edit" | "add" — Default is "edit"
  - position?: number — For "add" only: insert position (-1 or omit = append)
```

**Two modes:**
1. **Edit (default):** Target a TEXT node ID → update its content
2. **Add:** Target a FRAME container ID (like `bullets-container`) → create new element inside

**Use when:** 
- Modifying existing slides without destroying layout/styling (edit)
- Adding bullets/items without deleting the slide (add)

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
// Returns: ✓ Patched: 1 added
//          New elements: bullet-3 (28:95) in bullets-container
```

**Limitations:** `action: "add"` only works for simple text elements (bullets, items). For compound elements (cards, columns), use delete + push or clone.

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

### `monorail_clone`
Clone a slide and update its text content.

```
Parameters:
- source_slide_id: string — Figma node ID to clone (from capture)
- content_map?: object — { slot_id: "new text" }
```

**Use when:** Creating a new slide that matches an existing design. Preserves all styling, positioning, and structure.

---

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

**Example:**
```json
{
  "slide_id": "9:666",
  "scale": 0.5
}
```

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
1. monorail_push with mode: "replace" — deletes all existing slides, creates new ones
```

### Reorder deck
```
1. monorail_pull          — get all slide IDs
2. monorail_reorder       — pass IDs in desired order
```

### Visual QA (see what you rendered)
```
1. monorail_push          — create/update slides
2. monorail_screenshot    — see the result as an image
3. (iterate if needed)
```

### Add bullet/item to existing slide
```
1. monorail_capture       — get container ID (e.g., "bullets-container")
2. monorail_patch with action: "add" — append new element
   { target: "container-id", text: "• New bullet", action: "add" }
```

---

## Removed Tools (Session 15)

These tools were consolidated or removed:

| Old Tool | Replacement |
|----------|-------------|
| `create_deck`, `update_slides`, `get_deck` | Use `push`/`pull` |
| `validate_ir` | Inlined into `push` |
| `preview` | Removed (rarely used) |
| `extract_template`, `extract_design_system` | Merged into `capture` |
| `instantiate_template` | Renamed to `clone` |
| `create_styled_slide` | Deferred |
