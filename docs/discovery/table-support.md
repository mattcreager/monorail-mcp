# Discovery: Table Support in Figma Slides

> Session: 2026-01-12 — Can we read and create tables in Figma Slides?

## The Question

Figma Slides has native tables (seen in Assets panel). Can we:
1. **Read** existing tables during `monorail_pull`?
2. **Create** tables programmatically via `monorail_push`?

## Research Findings

### API Capabilities

| Feature | FigJam | Figma Design | Figma Slides |
|---------|--------|--------------|--------------|
| `figma.createTable()` | ✅ Yes | ❌ No | ❌ No |
| `TABLE` node type | ✅ Yes | ❌ No | ❓ Unknown |
| `TABLE_CELL` node type | ✅ Yes | ❌ No | ❓ Unknown |
| Manual table UI | N/A | N/A | ✅ Yes |

**Key finding:** `figma.createTable()` is **FigJam-only**. No official API for creating tables in Figma Slides.

### How Figma Slides Tables Work (User-Facing)

1. Click Assets → Table → drag to create
2. Import: copy from Google Sheets, paste → auto-creates table
3. Import: drag CSV file onto slide → creates table
4. Double-click cell to edit text
5. Styling via right sidebar (fills, fonts, alignment)
6. Resize rows/columns by dragging borders

### Unknown: Internal Node Structure

Figma Slides tables might be:
- **WIDGET nodes** — Figma's interactive component system
- **Component instances** — From an internal Figma library
- **Auto Layout frames** — Grid of frames with text nodes
- **Special Slides-only node type** — Not documented in public API

Our current `getAllTextNodes()` traversal only looks for `node.type === 'TEXT'`. If tables use a different structure (WIDGET, TABLE_CELL, etc.), we're not seeing them.

## Experiment Plan

### Step 1: Discover Node Structure (Priority)

Create a test slide in Figma Slides with a table, then use `monorail_capture` to inspect the raw node tree.

**Questions to answer:**
- What `node.type` does a table appear as?
- Are table cells accessible as children?
- Is text content in `characters` or somewhere else?
- What's the relationship between table structure and text nodes?

**How to run:**
```bash
# In Figma Slides, create a slide with a simple 2x2 table
# Select the table (or the slide containing it)
# Run monorail_capture to get raw node tree
```

### Step 2: Extend Pull (If Readable)

If tables are readable, extend `getAllTextNodes()` or add `getAllTableNodes()`:

```typescript
// Hypothetical — depends on actual node structure
if (node.type === 'TABLE' || node.type === 'WIDGET') {
  // Extract table structure
  const tableData = {
    rows: number,
    cols: number,
    cells: Array<{row: number, col: number, text: string}>
  };
}
```

### Step 3: Evaluate Creation Options

**Option A: Workaround with Auto Layout (Most Likely)**
Build "fake tables" using nested Auto Layout frames:
```
Frame (table-container, vertical)
├── Frame (row-1, horizontal)
│   ├── Frame (cell-1-1) → Text
│   ├── Frame (cell-1-2) → Text
├── Frame (row-2, horizontal)
│   ├── Frame (cell-2-1) → Text
│   └── Frame (cell-2-2) → Text
```

Pros:
- Works with existing API
- Full control over styling
- Patchable (each cell has stable node ID)

Cons:
- Doesn't look like native Figma Slides table
- Loses table-specific features (resize handles, CSV import)

**Option B: Use Table Creator Plugin**
Some plugins like "Table Creator" or "Custom Table Generator" create tables in Figma Design. Unknown if they work in Slides context.

**Option C: Accept Read-Only**
Read existing tables during pull, but don't support creating them. User creates tables manually, we preserve/edit them.

## IR Schema (Proposed)

If we can read/create tables, add to slide content schema:

```typescript
interface TableContent {
  type: 'table';
  headers?: string[];  // Optional header row
  rows: string[][];    // 2D array of cell text
  style?: {
    headerBackground?: string;
    alternateRows?: boolean;
    borderColor?: string;
  };
}

// In slide content:
{
  archetype: 'table',  // or embedded in any archetype
  content: {
    headline: 'Feature Comparison',
    table: {
      headers: ['Feature', 'Free', 'Pro'],
      rows: [
        ['Storage', '5GB', '100GB'],
        ['Support', 'Community', '24/7'],
        ['API Access', '❌', '✅'],
      ]
    }
  }
}
```

## Use Cases

Tables would enable:
- **Comparison slides** — Feature matrices, pricing tiers
- **Data presentation** — Stats, metrics, timelines
- **Structured content** — Schedules, rosters, specifications

Currently we work around this with:
- `bullets` archetype (loses structure)
- `two-column` archetype (only 2 columns, no rows)
- `position-cards` archetype (3 items only, no grid)

## Next Steps

1. **Empirical test** — Create table in Figma Slides, capture node tree
2. **Document findings** — What node type? Readable? Traversable?
3. **Decide approach** — Native support vs Auto Layout workaround
4. **Implement** — Either extend pull or build table archetype

## Open Questions

- [ ] What node type does a Figma Slides table appear as?
- [ ] Can we read cell text via Plugin API?
- [ ] If WIDGET, is internal structure accessible?
- [ ] Would Auto Layout "fake tables" be acceptable UX?
- [ ] Do table plugins (Table Creator etc.) work in Slides?

---

## Session Notes (2026-01-12)

### Empirical Test Results

**Test:** Captured slide 4 which has a native Figma Slides table.

**Result:** 
```
✓ Captured "4" (9 nodes, max_depth: 10)
Slots (3): headline, subline, layout_container
```

**Key evidence:** Color extraction detected `"Table:fill"` and `"Table:stroke"` — proving the table EXISTS but our traversal skipped its content entirely.

- 9 nodes on slide
- Only 3 slots captured (headline, subline, container)
- **6 nodes invisible** — the table structure

### Root Cause

Our `getAllTextNodes()` function (line 1534 in `code.ts`):

```typescript
if (node.type === 'TEXT') {
  // captures regular text
} else if ('children' in node) {
  // recurses into children
}
```

**Problem:** Tables in Figma have a special structure:
- `TableNode` (type: `'TABLE'`) contains rows
- Rows contain `TableCellNode` (type: `'TABLE_CELL'`)
- Cell text is in `cell.text.characters` — a `TextSublayerNode`, NOT a regular TEXT node

Our code only checks `node.type === 'TEXT'`, so table cell text is completely missed.

### Proposed Fix

Add TABLE handling to `getAllTextNodes()`:

```typescript
if (node.type === 'TEXT') {
  // existing text handling
} else if (node.type === 'TABLE') {
  // Special table handling
  const table = node as TableNode;
  for (let row = 0; row < table.numRows; row++) {
    for (let col = 0; col < table.numColumns; col++) {
      const cell = table.cellAt(row, col);
      if (cell && cell.text) {
        results.push({
          node: cell.text as unknown as TextNode, // TextSublayerNode
          depth,
          parentName: `Table[${row},${col}]`,
          absoluteX: node.x + offsetX,
          absoluteY: node.y + offsetY,
        });
      }
    }
  }
} else if ('children' in node) {
  // existing recursion
}
```

### Next Steps

1. **Verify TABLE node type exists in Slides** — API docs say TABLE is FigJam-only, but our color extraction found "Table" as a node name. Need to confirm actual `node.type` value.

2. **Add debug logging** — Log `node.type` for all nodes on a slide with a table to see exact structure.

3. **Implement read support** — If TABLE nodes work, add extraction to pull.

4. **Evaluate write support** — If `createTable()` is truly FigJam-only, we'll need Auto Layout workaround for creating tables.

### Open Questions Resolved

- [x] What node type does a Figma Slides table appear as? → **Unknown type, but named "Table"** (needs debug logging)
- [x] Can we read cell text via Plugin API? → **Likely yes, via `cell.text.characters`**
- [ ] If WIDGET, is internal structure accessible? → Still unknown
- [ ] Would Auto Layout "fake tables" be acceptable UX? → Fallback option if needed

### Decision

**✅ TABLE read support implemented!** Tables in Figma Slides use the standard `TABLE` node type with `TABLE_CELL` children, just like FigJam.

### Implementation (Session 22)

**Files changed:**
- `figma-plugin/code.ts`:
  - Added `TABLE` handling to `captureNodeTree()` — extracts `numRows`, `numColumns`, `tableCells[]`
  - Added `TABLE` handling to `getAllTextNodes()` — extracts cell text with row/col metadata
  - Extended `CapturedNode` interface with table properties
  - Extended `ElementInfo` interface with `isTableCell`, `tableRow`, `tableCol`
  - Updated `buildElementInfos()` to classify table cells as `type: "table_cell"`
- `figma-plugin/ui.html`:
  - Fixed `slide_id` parameter forwarding (was being dropped)

**Pull output now includes:**
```json
{
  "type": "table_cell",
  "text": "cell content",
  "parentName": "Table[0,1]",
  "isTableCell": true,
  "tableRow": 0,
  "tableCol": 1
}
```

### What Works Now
- ✅ **Read tables** — `monorail_pull` extracts all cell text with row/col positions
- ✅ **Capture tables** — `monorail_capture` includes table structure in node tree
- ✅ **Cell IDs stable** — Each cell has a Figma node ID for patching

### What's Next (Future Work)
- [ ] **Patch table cells** — Current patch fails because `TextSublayerNode` isn't retrievable via `getNodeByIdAsync`. Need to store table ID + row/col, then access via `table.cellAt(row, col).text.characters = newText`
- [ ] **Create tables** — `figma.createTable()` is FigJam-only; need Auto Layout workaround for Slides
- [ ] **Table archetype** — IR schema for table slides (headers, rows, styling)
- [ ] **Reconstruct table structure** — Group cells by row/col in pull output for easier reading

### Patching Limitation Discovered

Table cells use `TextSublayerNode` which:
- Has an `id` property (e.g., `4:688`)
- Is NOT a `SceneNode` — cannot be retrieved with `figma.getNodeByIdAsync()`
- Must be accessed via parent: `tableNode.cellAt(row, col).text`

**To enable patching, we need to:**
1. Store table node ID alongside cell data
2. In patch handler, detect table cells by metadata
3. Look up TableNode, then access cell via coordinates
