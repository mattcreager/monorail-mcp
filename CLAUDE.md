# Monorail

MCP server for real-time design collaboration in Figma. 14 tools across 5 categories.

## Architecture

- MCP server: `src/index.ts` (WebSocket bridge on port 9876)
- Figma plugin: `figma-plugin/` (WebSocket client)
- Shared types: `shared/types.ts`
- Communication: MCP over stdio to Claude, WebSocket to Figma plugin

## Development

- Build server: `npm run build`
- Build plugin: `cd figma-plugin && npm run build`
- Watch server: `npm run dev`
- Watch plugin: `cd figma-plugin && npm run watch`
- No test suite currently

## Key Files

- `src/index.ts` — All 14 MCP tool definitions and handlers
- `figma-plugin/code.ts` — Plugin logic (all Figma API calls)
- `shared/types.ts` — TypeScript interfaces shared between server and plugin
- `docs/SKILL.md` — Narrative methodology (loaded as MCP resource)
- `docs/PLUGIN-SPEC.md` — IR format specification

## Conventions

- Tool names prefixed with `monorail_`
- Figma node IDs used as stable references across tools
- IR (Intermediate Representation) format for slide specifications
- Learnings logged to `docs/failures.md`
- Architecture decisions in `docs/decisions/`
- The Ralph Wiggum methodology: one focused task per session, log findings

## Project Context

Named after The Simpsons' "Marge vs. the Monorail."
See `PLAN.md` for current state and session history.
See `docs/HANDOFF.md` for team onboarding.
