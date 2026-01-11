# Test Brief: The Monorail Deck

Dogfood the system. Build a deck that explains Monorail using Monorail.

## Situation

Someone is evaluating Monorail for their team. They're a technical PM or design lead who's:
- Frustrated with current deck workflows
- Skeptical of "AI presentation tools" (seen the hype, been burned)
- Short on time, needs to make a decision

## Audience

- Primary: Technical PM or design lead evaluating tools
- Secondary: Their team who'd actually use it

## Ask

Try Monorail for their next important deck.

## Constraints

- 8-10 slides
- 10 minute presentation
- No live demo (this is the pitch, not the product walkthrough)

## Context to Dump

Monorail is a system for making decks that have narrative coherence. Key pieces:

**The problem it solves:**
- Most AI deck tools generate slides, not arguments
- Output looks good but doesn't land
- No feedback loop—you generate, then manually fix
- The "find the shape" phase is unsupported

**How it works:**
- Claude + Figma as shared canvas
- Claude writes via plugin, reads via MCP
- Human can spike directly in Figma
- Claude sees human edits, adapts
- Continuous visual feedback throughout

**The narrative toolkit:**
- Spine: setup → turn → landing
- Beats: narrative moves with jobs
- Archetypes: constrained slide templates
- Hallway test: one sentence summary
- Deletion test: every slide earns its place

**Why Figma:**
- It's where production decks end up anyway
- Bidirectional: Claude proposes, human spikes, Claude adapts
- Not a one-way export—a collaboration space

**What's different from other AI deck tools:**
- Not "prompt → slides" 
- Starts with argument, not aesthetics
- Visual feedback throughout (not just at the end)
- Human can intervene at any point in native tool
- Partial locking (some slides done, others in flux)

## What We're Testing

1. Can we find a spine for "why use Monorail"?
2. Do the beats build a compelling argument?
3. Does the hallway sentence land?
4. Does eating our own cooking reveal gaps in the system?

## Success Criteria

The deck should:
- Have a clear turn (the moment it shifts from problem to solution)
- Pass the deletion test (no filler slides)
- Have the hallway sentence on a slide
- Make someone want to try Monorail

## Meta-Note

This is recursive. We're using Monorail to explain Monorail. If it works, that's the best demo. If it fails, we learn where the system breaks.
