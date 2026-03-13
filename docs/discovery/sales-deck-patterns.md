# Sales Deck Patterns

> Learnings from building the Keycard ACP sales deck (2026-01-21)

## The Core Insight

> "You need to make this a developer productivity conversation, not an MCP access conversation."
> — Andrew Lloyd

Technical features don't sell. Business outcomes do. Frame everything in terms of what the buyer cares about.

---

## Pattern: Pain Hierarchy

Don't jump to the aspirational destination. Establish the pain in order:

```
Step 0: They can't even USE tools (blocked today)
Step 1: Building/governing tools at scale
Nirvana: Autonomy curve / 10x productivity
```

**Mistake:** Opening with "here's how you get to 10x" when they can't even get Cursor working.

**Fix:** "Step 0" slide that shows you understand their immediate pain before painting the destination.

---

## Pattern: Persona-Based Qualifying

Open with personas to let the buyer self-identify:

| Persona | Who | Pain |
|---------|-----|------|
| Agentic Coder | Devs using Cursor/Claude Code | "My agent can't access anything useful" |
| Agent/Tool Builder | Building agents/MCP servers | "I need to expose functionality safely" |
| Enabler/Governor | Security/Platform/IT | "I need to enable without losing control" |

**The slide:** "Where are you in this journey? Which resonates?"

**Why it works:** 
- Qualifies the conversation
- Lets them tell you their pain
- Frames you as understanding their world

**Bottom text should be specific:** "Agentic adoption is stuck" not "Developer productivity is blocked" (too generic).

---

## Pattern: Post-Demo Aspirational Close

```
1-7. Pre-demo slides (problem, mechanics, proof)
[DEMO]
8. Aspirational destination slide
```

**Why:** The demo proves it works. THEN you paint the picture of what becomes possible.

Example: "The Autonomy Curve"
- Today: 3-5x, bottleneck = your attention
- With Keycard: 10x+, bottleneck = policy (not you)
- Punchline: "Autonomy is the new velocity. Trust is the bottleneck."

---

## Pattern: Policy Collapse

For architecture/how-it-works slides, the key insight is **when** policy is evaluated:

**Old model:**
```
Credential created → [long gap] → Used somewhere
(decision here)                   (no context, no visibility)
```

**New model:**
```
User → Machine → Agent → Task → Tool Call → [POLICY COLLAPSE]
                                            All context available
                                            Decision made HERE
                                            Full visibility
```

**Punchline:** "You're not securing the credential. You're securing the moment of access."

---

## Pattern: Old/New Comparison (Once)

Comparing old world vs new world is powerful—but only once. 

**Mistake:** Three consecutive slides all hammering "old is bad, new is good."

**Fix:** One clear comparison slide ("The Shift"), then move to mechanics.

| Slide | Should it compare old/new? |
|-------|---------------------------|
| Problem/Anatomy | No — validate their concern |
| The Shift | YES — single comparison |
| How It Works | No — show mechanics only |
| Value/Loop | No — show what you enable |

---

## Pattern: Feedback Flywheel

Security-as-accelerant framing:

```
Agent hits boundary → Context captured → Security sees full picture 
→ Decision becomes policy → Next iteration: no friction
```

**Key phrases:**
- "Security isn't approving requests. They're evolving the system."
- "Every boundary hit makes the org smarter."
- "Security becomes the accelerant, not the brake."

---

## Pattern: Andrew's Qualifying Questions

Before diving into the pitch, understand where they are:

- "What percentage of your devs have Cursor access?"
- "How many tools does Cursor have access to?"
- "How many agents have you built today?"
- "Are you using third-party agents or proprietary?"

**Why:** Determines if they're solving "how do I get started" vs "how do I scale."

---

## Anti-Patterns

### Generic Productivity Claims
❌ "Developer productivity is blocked"
✅ "Agentic adoption is stuck"

### Technical Feature Focus
❌ "We do runtime policy resolution"
✅ "Your developers can use real tools, governed from day one"

### Selling Before Defining
❌ Jump to solution
✅ Stay in problem space, make them feel understood

### ROI Without Context
❌ "10x productivity"
✅ "3,000 devs, 30% more productive. It's criminally negligent not to get this done this week."

---

## Deck Structure Template

```
1. Persona — "Where are you?" (qualify)
2. Problem — "You're right to be worried" (validate)
3. The Shift — Old vs New (single comparison)
4. How It Works — Step 0 + Architecture (mechanics)
5. Value — Feedback flywheel (security as accelerant)
6. Proof — Concrete workflow (see it in action)
7. Summary — What we are (Nirvana)
   [DEMO]
8. Destination — Autonomy Curve (aspirational close)
9. Next Steps
```

---

## Related

- `docs/SKILL.md` — Narrative toolkit (spine, beats, archetypes)
- `sales-deck/andrew-advice.md` — Full transcript from Andrew Lloyd session
- `sales-deck/keycard-for-cursor.md` — Product context
