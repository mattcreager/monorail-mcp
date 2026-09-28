# Monorail

MCP server for real-time design collaboration in Figma. 15 tools across 5 categories.

## Architecture

- MCP server: `src/index.ts` (one per Claude session; connects to the proxy on 9877 with the token in ~/.monorail/token, reconnecting if it goes away)
- Proxy: `src/proxy.ts` (shared by all sessions; plugin on 9876, servers on 9877, loopback only; one request in flight per plugin with a TTL, the rest queued; writes hold the plugin until they answer)
- Who may connect: `src/auth.ts` (token, plugin pairing, handshake checks)
- Wire protocol: `shared/protocol.ts` (request → reply types, per-type timeouts). A new request type goes there, nowhere else.
- Figma plugin: `figma-plugin/` (WebSocket client)
- Shared types: `shared/types.ts`
- Communication: MCP over stdio to Claude, WebSocket to Figma plugin

## Development

- Build server: `npm run build`
- Build plugin: `cd figma-plugin && npm run build`
- Watch server: `npm run dev`
- Watch plugin: `cd figma-plugin && npm run watch`
- Tests: `npm test` (node:test against dist/) — geometry, motion, typography and probe helpers; the proxy and server end to end with `test/fake-plugin.js`; the plugin's code.js and ui.html in a VM
- Proxy wedge post-mortem and the bridge protocol: `docs/proxy-wedge-2026-09.md`

## Key Files

- `src/index.ts` — All 15 MCP tool definitions and handlers
- `shared/motion.ts` — pure logic for native reveals (build step → timeline offset, style matching); tested in `test/motion.test.js`
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

<!-- WORKBENCH:START -->
## Board State

Managed by Agent Workbench. Use `workbench` CLI:
- `workbench status` — view board
- `workbench ws list` — list workstreams
- `workbench add <ws-id> "title"` — add task to workstream
- `workbench move <task-id> <stage>` — move task (planning/running/done)
- `workbench done <task-id>` — mark done

### ○ tasks f0973110 `f0973110`
Orphan task group
- **planning**: `1` Fix monorail MCP plugin routing to correct Claude instance — ## Problem

### ○ team 0fdae258 `0fdae258`
*(no tasks)*

<!-- WORKBENCH:END -->