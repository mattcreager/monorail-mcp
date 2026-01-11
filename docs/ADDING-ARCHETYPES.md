# Adding New Archetypes

Guide for adding complex slide templates to Monorail.

## Quick Reference

| File | What to Add |
|------|-------------|
| `figma-plugin/code.ts` | Types + Colors + Rendering |
| `src/index.ts` | Types + Constraints + Resource docs |
| `docs/references/archetypes.md` | Human-readable reference |

## Step-by-Step

### 1. Design the IR Schema

Before coding, sketch out the content structure:

```typescript
// Example: position-cards
{
  eyebrow?: string;           // "OUR POSITION"
  headline?: string;          // Main title
  subline?: string;           // Secondary line
  cards?: Array<{
    label: string;            // "THE FOUNDATION"
    title: string;            // "Identity"
    body: string;             // Description
    badge?: string;           // "✓ Built"
    badge_color?: 'green' | 'cyan' | 'orange';
  }>;
  features?: Array<{
    label: string;
    description: string;
  }>;
}
```

### 2. Update Plugin Types

In `figma-plugin/code.ts`, add to `SlideContent` interface:

```typescript
interface SlideContent {
  // ... existing fields ...
  
  // New archetype fields
  eyebrow?: string;
  cards?: Array<{...}>;
  features?: Array<{...}>;
}
```

### 3. Add Colors (if needed)

In `figma-plugin/code.ts`, add to `COLORS` object:

```typescript
const COLORS = {
  // ... existing colors ...
  
  // New colors for archetype
  cyan: { r: 0.0, g: 0.74, b: 0.84 },
  cardBg: { r: 0.1, g: 0.1, b: 0.12 },
};
```

### 4. Add Rendering Code

In `figma-plugin/code.ts`, add case to `addContentToParent` switch:

```typescript
case 'my-archetype':
  {
    // Create visual elements
    if (c.eyebrow) {
      await addText(parent, c.eyebrow, x, y, fontSize, bold, color, maxWidth, 'eyebrow');
    }
    
    // Use named nodes for patch targeting
    // Name format: 'elementType' or 'elementType-index'
  }
  break;
```

**Important**: Name all text nodes for `monorail_patch` targeting!

### 5. Update MCP Server Types

In `src/index.ts`, add same fields to `SlideContent` interface:

```typescript
interface SlideContent {
  // ... existing fields ...
  
  // Must match plugin types exactly
  eyebrow?: string;
  cards?: Array<{...}>;
}
```

⚠️ **Known issue**: Types are duplicated. Keep them in sync manually.

### 6. Add Archetype Constraints

In `src/index.ts`, add to `ARCHETYPES` object:

```typescript
"my-archetype": {
  requiredFields: ["headline", "cards"],
  constraints: {
    eyebrow: { maxWords: 4 },
    headline: { maxWords: 15 },
    cards: { maxItems: 3 },
  },
},
```

### 7. Update MCP Resource Documentation

In `src/index.ts`, find the `monorail://archetypes` resource string and add:

```typescript
## my-archetype
Description of when to use it.
- field1: constraints
- field2: constraints

Example:
\`\`\`json
{...}
\`\`\`
```

### 8. Update Reference Docs

In `docs/references/archetypes.md`, add full documentation.

### 9. Build & Test

```bash
# Build plugin
cd figma-plugin && npm run build

# Build server  
cd .. && npm run build

# Restart MCP (in Cursor: toggle monorail off/on in Settings → MCP)
# Reconnect Figma plugin
# Test with monorail_push
```

## Testing Checklist

- [ ] Push creates slide with all elements
- [ ] All text nodes have names (check via capture)
- [ ] Pull returns all content in `elements` array
- [ ] Patch can update individual elements
- [ ] Validation catches missing required fields
- [ ] Validation warns on constraint violations

## Common Pitfalls

1. **Forgot to rebuild** — Both plugin AND server need `npm run build`
2. **MCP not restarted** — Server runs old code until Cursor restarts it
3. **Plugin disconnected** — WebSocket drops on server restart, re-run plugin
4. **Unnamed text nodes** — Can't patch elements without names
5. **Type mismatch** — Plugin and server `SlideContent` must match
6. **Resource not updated** — Models won't know about archetype

## Future Improvements

- [ ] Extract shared types to `shared/types.ts`
- [ ] Auto-generate resource docs from ARCHETYPES
- [ ] Add hot-reload for MCP server
- [ ] Add rendering tests (snapshot comparison)
