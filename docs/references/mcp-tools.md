# MCP Tools Reference

> The tools Claude uses to interact with Figma via the Monorail plugin.

## Connection

### `monorail_connection_status`
Check if the Figma plugin is connected.

```
Returns: Connection state, plugin name/version, connected timestamp
```

## Read Operations

### `monorail_pull_ir`
Request current deck IR from Figma plugin.

```
Returns: Full deck IR with:
- slides[].elements[] — ALL text elements with Figma node IDs
- slides[].has_diagram — true if complex nested content
- slides[].figma_id — Figma node ID for the slide
```

**Use when:** Need to see what's on the slides before editing.

## Write Operations

### `monorail_push_ir`
Push IR to Figma plugin, optionally auto-apply.

```
Parameters:
- ir: string (JSON) — The deck IR to push
- autoApply?: boolean — If true, plugin applies immediately
```

**Use when:** Creating new slides or replacing existing ones with archetypes.

### `monorail_patch_elements`
Update specific text elements by Figma node ID.

```
Parameters:
- patches.changes[]: Array of { target: "node-id", text: "new text" }
```

**Use when:** Modifying existing slides without destroying layout/styling.

**Example:**
```json
{
  "patches": {
    "changes": [
      { "target": "9:144", "text": "Updated pain point #1" },
      { "target": "9:147", "text": "Updated pain point #2" }
    ]
  }
}
```

## Validation & Preview

### `monorail_validate_ir`
Validate IR against archetype constraints.

```
Parameters:
- ir: string (JSON) — The deck IR to validate

Returns: Warnings for word limits, missing fields, unknown archetypes
```

### `monorail_preview`
Generate HTML preview file.

```
Parameters:
- output_path?: string — Where to save (default: ./preview.html)
```

## Local State

### `monorail_create_deck`
Create/replace deck IR in MCP server memory.

### `monorail_update_slides`
Merge updates into current deck (respects locked status).

### `monorail_get_deck`
Get current deck IR from MCP server memory.

---

## Workflow Patterns

### Read → Patch (preserve styling)
```
1. monorail_pull_ir — see all elements
2. monorail_patch_elements — update specific text by ID
```

### Create New (use archetypes)
```
1. monorail_push_ir with autoApply: true
```

### Iterate on Copy
```
1. monorail_pull_ir
2. Analyze, suggest changes
3. monorail_patch_elements
4. Repeat
```
