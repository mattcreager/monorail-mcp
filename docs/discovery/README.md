# Discovery

> Explorations and spikes BEFORE they become decisions.

## What goes here

- API capability investigations
- "Can we do X?" experiments
- Prototype results
- Research findings

## What doesn't go here

- Final decisions → `docs/decisions/`
- Stable reference docs → `docs/references/`
- Session summaries → `PLAN.md`
- Things that didn't work → `docs/failures.md`

## Lifecycle

1. **Spike:** "Can the plugin read component styles?" → `discovery/component-styles-spike.md`
2. **If promising:** Becomes a decision doc in `decisions/`
3. **If dead end:** Summary goes to `failures.md`, delete spike

## Current Discoveries

| Discovery | Status | Summary |
|-----------|--------|---------|
| [ai-dx.md](ai-dx.md) | 🆕 Open | AI Developer Experience — making Monorail easy for Claude |
| [table-support.md](table-support.md) | ✅ Read works | Tables readable! Create needs workaround |
| [design-system-remap.md](design-system-remap.md) | 📋 Documented | Clone with palette swap |
| [complex-template-experiment.md](complex-template-experiment.md) | ✅ Complete | Keycard-style slides |
| [dogfood-gaps.md](dogfood-gaps.md) | ✅ Complete | Gaps from deck rendering |
| [dogfood-claude-desktop.md](dogfood-claude-desktop.md) | ✅ Complete | Claude Desktop validation |
| [shape-position-capture.md](shape-position-capture.md) | 🆕 Open | Capture shape x/y for "learn from user edits" workflow |
