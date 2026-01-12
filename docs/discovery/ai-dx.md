# Discovery: AI Developer Experience (AI DX)

> How do we make Monorail easy for Claude to use effectively?

## The Question

We're building tools for an AI collaborator. What makes a good "developer experience" when the developer is an LLM?

## Current State

### What We Have
- 9 MCP tools with descriptions
- 3 MCP resources (skill, archetypes, ir-format)
- Tool descriptions explain "what" but not always "when"
- Screenshot added visual QA guidance to skill resource

### What Works
- Tool descriptions are read by Claude before use
- Resources provide context when explicitly requested
- Error messages explain what went wrong

### Gaps Identified

**1. Discoverability**
- Claude doesn't automatically read resources — must be prompted
- No "getting started" flow for new conversations
- Tool relationships not explicit (e.g., "after push, use screenshot")

**2. Workflow Guidance**
- When should Claude pull vs push vs patch?
- How to handle errors gracefully?
- What's the expected iteration loop?

**3. Error Recovery**
- Errors say what failed but not how to fix
- No suggestions for common failure modes
- Font fallback happens silently — should it be surfaced?

**4. Context Efficiency**
- Full pull output can be large (15 slides = big JSON)
- Does Claude need all elements or just headlines?
- Could we have a "summary" mode?

**5. Proactive Hints**
- After push: "Use monorail_screenshot to verify"
- After patch failure: "Node ID may have changed, try pull first"
- After clone: "New slide ID is X, use for subsequent patches"

## Ideas to Explore

### Tool Description Improvements
```
Current: "Pull the current deck state from Figma..."
Better:  "Pull the current deck state from Figma. Use this BEFORE 
         making changes to get element IDs for patching. Returns 
         slide content + Figma node IDs."
```

### Workflow Hints in Responses
```
Current: "✓ Pushed 5 slides to Figma"
Better:  "✓ Pushed 5 slides to Figma
         
         Tip: Use monorail_screenshot to verify the layout looks correct."
```

### Contextual Resources
- Auto-include archetypes resource when pushing?
- Surface skill resource at conversation start?
- Tool-specific tips in error messages?

### Compact Output Modes
```json
// Current pull: full element details
// Potential: summary mode
{
  "slides": [
    { "id": "intro", "figma_id": "4:562", "headline": "GTM Kick-off", "archetype": "title" }
  ],
  "element_count": 47,
  "tip": "Use full pull to get element IDs for patching"
}
```

### Smart Defaults
- Screenshot after every push? (opt-out vs opt-in)
- Auto-pull before patch if stale?
- Suggest archetype based on content?

## Questions to Answer

1. **What context does Claude need at conversation start?**
   - Should we auto-surface the skill resource?
   - Is tool discovery enough?

2. **How verbose should tool responses be?**
   - Terse for speed vs helpful for learning?
   - Should responses include "next step" suggestions?

3. **When should we show vs tell?**
   - Always screenshot after push?
   - Or trust Claude to ask when needed?

4. **How do we handle multi-deck scenarios?**
   - Claude doesn't know which Figma file is active
   - Should status show current deck name?

5. **What errors are recoverable vs fatal?**
   - Font not found → fallback (recoverable)
   - Node not found → stale IDs (needs pull)
   - Plugin disconnected → needs human action

## Success Metrics

How would we know AI DX is good?
- Fewer failed tool calls
- Shorter iteration loops (push → done vs push → fix → fix → done)
- Less "can you check if that worked?" from users
- Claude proactively uses screenshot for QA

## Next Steps

- [ ] Audit all tool descriptions for "when to use" clarity
- [ ] Add workflow hints to tool responses
- [ ] Consider auto-screenshot after push (opt-out?)
- [ ] Test with fresh Claude conversation — what's confusing?
- [ ] Document common error patterns + recovery steps

## Related

- `docs/references/mcp-tools.md` — current tool docs
- `src/index.ts` — tool descriptions + resources
- Session 24 — added visual QA to skill resource
