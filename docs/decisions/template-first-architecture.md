# Decision: Template-First Architecture

> Status: **VALIDATED** — Session 29 confirmed primitives work, design principles added

## Context

Monorail started with **archetypes** — 11 hardcoded slide layouts in the plugin. Claude picks an archetype, fills content slots, plugin renders.

This works but has limitations:
- Rigid: Can't express layouts outside the 11 patterns
- Lossy: IR can't represent everything Figma can (shapes, custom styling)
- Two sources of truth: IR vs Figma state diverge over time
- Constrains creativity: Word limits ("headline ≤8 words") may help clarity but limit expression

## The Shift

Move from **archetype-first** to **template-first**:

| Archetype-First (current) | Template-First (proposed) |
|---------------------------|---------------------------|
| 11 hardcoded layouts | Unlimited user-defined templates |
| Constraints in code | Guidance in documentation |
| Claude picks archetype, fills slots | Claude designs or clones templates |
| IR is primary representation | Figma designs are primary |
| Push creates structure | Capture/clone preserves fidelity |

## Key Concepts

### Template
A concrete Figma design that can be cloned and populated with content.

### Archetype (redefined)
No longer hardcoded — now **soft guidance** in the skill doc. Claude uses design wisdom but isn't constrained by it. Multiple templates can embody the same archetype differently.

### Primitives
Low-level tools for creating designs from scratch: `create_frame`, `add_text`, `add_shape`, `set_auto_layout`, `apply_style`. These exist inside `code.ts` but aren't exposed as MCP tools yet.

## Workflows

### 1. Design a Template
When no existing template fits, create one using primitives (or design in Figma manually).

### 2. Use a Template
Browse template library → clone → patch with real content.

### 3. One-Off Custom Slide
Use primitives directly without saving as template. For slides that won't be reused.

### 4. Refine a Template
Edit template slide in Figma → re-capture → library updated.

## What Aligns From Earlier Discussion

Several insights from the architecture review support this direction:

**1. Design-first vs IR-first**
> "The primary workflow could be: human designs, Claude multiplies"

Templates flip the model. Instead of Claude generating and human polishing, human (or Claude) designs the template, then Claude multiplies it with different content.

**2. Capture/clone as primary path**
> "Capture → clone preserves ALL styling, while push creates 'functional' slides"

Template-first makes capture/clone the main workflow, not a workaround. Push becomes optional bootstrapping.

**3. Dual representation tension**
> "IR vs Figma state diverge over time"

Templates reduce this tension. The template IS the Figma design — no lossy translation.

**4. Tool surface simplification**
With templates as primary, we could potentially simplify:
- Primitives (for design)
- `capture` (save as template)
- `clone` (use template)
- `patch` / `delete` (edit)
- `pull` / `screenshot` (read)

Push might become "clone blank + apply" or go away entirely.

**5. AI DX pattern**
> "Can Claude discover how to use this without human help?"

Template library needs discoverability: names, descriptions, when-to-use guidance. Same pattern as container discovery.

## Open Questions

### How can Claude render high-quality slides consistently?

**ANSWERED (Session 29):** Tested Option A (Figma primitives). Results:

| Slide Complexity | Quality | Notes |
|------------------|---------|-------|
| Simple (quote) | 95% | Needed vertical centering fix |
| Medium (stats) | 90% | Good hierarchy, color coding |
| Complex (3-col) | 80% | Missing icons, fine spacing |
| Very Complex | 75% | Hit ceiling on patterns, connectors |

**Key findings:**
- Claude CAN design with primitives (75-95% depending on complexity)
- Main gap is **spatial intuition** — defaults to top-left, needs guidance on centering
- Screenshot feedback loop is **essential** — can't improve what you can't see
- Design principles in skill doc directly address the spatial gap

**The answer is: multiple approaches for different needs:**
- **Primitives** = drafts, exploration (80% quality)
- **Archetypes** = speed, constrained content (90% quality)  
- **Clone** = production, perfect fidelity (100% quality)

Options B (HTML/CSS) and D (few-shot) remain untested but may be worth exploring later.

### Template storage
Where do templates live?
- Dedicated Figma page in the deck file?
- Separate "template library" Figma file?
- MCP resource listing available templates?

### Template definition vs content rendering
Should these be distinct workflows (separate tools/modes) or same tools with different intent?

Current thinking: **Same tools, different mindset.** When designing, focus on layout. When populating, focus on message. The tools don't need to know which mode you're in.

### Backward compatibility
Existing archetypes still work. This is additive — templates are a new capability, not a replacement. Archetypes become "built-in templates" if we want to keep them.

## Leverage Analysis

This decision has high leverage because it affects how we handle ALL future layout requests.

### What Gets Simpler or Goes Away

| Item | Impact |
|------|--------|
| Shape round-tripping | **Potentially obsolete** — templates preserve shapes via clone |
| "Add compound elements" | **Solved** — clone from template handles nested structures |
| Future archetype requests | **Zero engineering** — just design templates |
| `code.ts` archetype renderers | **Could shrink** — 11 archetypes → built-in templates |
| IR format complexity | **Reduced** — IR becomes optional bootstrap, not primary |

### What Still Needs Work

| Item | Why |
|------|-----|
| Template library/discovery | How does Claude find and choose templates? |
| AI DX for templates | Discoverability, descriptions, when-to-use |
| Primitives (if Option A) | Need to expose low-level tools |
| HTML→Figma translation (if Option B) | New capability to build |
| Theme system (if Option C) | Design token application |

### The Compounding Effect

**Without template-first:**
```
New layout → Code archetype → Test → Deploy → Repeat
             (hours/days per layout, linear effort)
```

**With template-first:**
```
New layout → Design in Figma (or HTML) → Capture → Done
             (minutes, no code changes, compounds)
```

Every layout we DON'T have to code is future velocity saved. The question is: what's the minimum investment to unlock this?

## Next Steps

1. ~~**Spike: Can Claude render quality slides?**~~ ✅ Done (Session 29)
   - Option A (primitives) works: 75-95% quality
   - Design principles added to skill doc

2. **Template library concept** — NEXT
   - Where do templates live? (Dedicated Figma page? Plugin storage?)
   - How is metadata stored? (File naming? Plugin data?)
   - How does Claude browse/search? (`monorail://templates` resource)

3. **Primitives Rev 2** — Fill gaps:
   - Text alignment (center, right)
   - Arrow heads on lines
   - Image placeholder frames

4. ~~**Soft archetypes** — move guidance from code to skill doc~~ ✅ Done (Session 29)
   - Design principles section covers spatial guidelines, typography, self-critique

## Related

- `docs/discovery/ai-dx.md` — discoverability patterns
- `docs/ARCHITECTURE.md` — current system design
- Session 28 — delete implementation + this direction discussion
