/**
 * The wire protocol between the MCP server, the proxy and the Figma plugin.
 *
 * One table, used by all three, so a request type can't be added to one side
 * and forgotten on another. docs/failures.md records what happens when it is:
 * the proxy doesn't recognise the reply, never releases its lock, and every
 * session times out.
 *
 * Protocol 2 (2026-09) adds three optional fields to every request:
 *   requestId    the sender's id; replies echo it, so a late reply can't
 *                resolve the wrong call
 *   timeoutMs    how long the sender will wait; the proxy uses it as the
 *                request's TTL, so a lost reply can't hold the plugin forever
 *   clientLabel  who is asking; shown to anyone the request makes wait
 * Senders that omit them (protocol 1 servers, scripts) still work. See
 * docs/proxy-wedge-2026-09.md.
 */

export const PROTOCOL_VERSION = 2;

/** Wire request type (server → proxy → plugin UI) → the reply type the plugin sends. */
export const RESPONSE_FOR: Readonly<Record<string, string>> = {
  'request-export': 'exported',
  'push-ir': 'applied',
  'patch-elements': 'patched',
  'capture-template': 'template-captured',
  'instantiate-template': 'instantiated',
  'create-styled-slide': 'styled-slide-created',
  'delete-slides': 'slides-deleted',
  'reorder-slides': 'slides-reordered',
  'request-screenshot': 'screenshot-exported',
  'apply-primitives': 'primitives-applied',
  'get-css': 'css-extracted',
  'export-node': 'node-exported',
  'get-component-info': 'component-info',
  'find-nodes': 'nodes-found',
  'apply-motion': 'motion-result',
  'apply-probe': 'probe-result',
};

export const REQUEST_TYPES: ReadonlySet<string> = new Set(Object.keys(RESPONSE_FOR));
export const RESPONSE_TYPES: ReadonlySet<string> = new Set(Object.values(RESPONSE_FOR));

/**
 * Plugin-internal message type (ui.html → code.ts) → the reply code.ts posts.
 * The UI renames a few wire types on the way in (request-export → export-ir,
 * push-ir → apply-ir, request-screenshot → export-screenshot).
 */
export const PLUGIN_REPLY_FOR: Readonly<Record<string, string>> = {
  'apply-ir': 'applied',
  'export-ir': 'exported',
  'patch-elements': 'patched',
  'capture-template': 'template-captured',
  'instantiate-template': 'instantiated',
  'create-styled-slide': 'styled-slide-created',
  'delete-slides': 'slides-deleted',
  'reorder-slides': 'slides-reordered',
  'export-screenshot': 'screenshot-exported',
  'apply-primitives': 'primitives-applied',
  'get-css': 'css-extracted',
  'export-node': 'node-exported',
  'get-component-info': 'component-info',
  'find-nodes': 'nodes-found',
  'apply-motion': 'motion-result',
  'apply-probe': 'probe-result',
};

/**
 * How long the server waits for each request by default, and so how long the
 * proxy holds the plugin for it. Reads of big nodes (getCSSAsync, exportAsync,
 * a probe walking a large subtree) legitimately take longer than edits. A
 * longer timeout also means a request whose reply is lost holds the plugin
 * longer, so these stay within a couple of minutes.
 */
export const DEFAULT_TIMEOUT_MS: Readonly<Record<string, number>> = {
  'request-export': 60_000,
  'push-ir': 60_000,
  'patch-elements': 45_000,
  'capture-template': 60_000,
  'instantiate-template': 45_000,
  'create-styled-slide': 45_000,
  'delete-slides': 30_000,
  'reorder-slides': 30_000,
  'request-screenshot': 60_000,
  'apply-primitives': 60_000,
  'get-css': 90_000,
  'export-node': 90_000,
  'get-component-info': 30_000,
  'find-nodes': 60_000,
  'apply-motion': 45_000,
  'apply-probe': 120_000,
};

/**
 * Requests that change the document. The proxy never lets another request
 * reach the plugin while one of these is running, even past its TTL (up to
 * WRITE_HOLD_MS more): two edits interleaving at every await in the plugin
 * could corrupt a document. Reads are released at their TTL.
 */
export const WRITE_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'push-ir', 'patch-elements', 'instantiate-template', 'create-styled-slide',
  'delete-slides', 'reorder-slides', 'apply-primitives', 'apply-motion',
]);

/** The same set under the names code.ts sees (the UI renames push-ir to apply-ir). */
export const PLUGIN_WRITE_TYPES: ReadonlySet<string> = new Set([
  'apply-ir', 'patch-elements', 'instantiate-template', 'create-styled-slide',
  'delete-slides', 'reorder-slides', 'apply-primitives', 'apply-motion',
]);

/** How long past its TTL a write may keep the plugin before everyone else is let back in. */
export const WRITE_HOLD_MS = 120_000;

/** TTL for a request that carries no timeoutMs: protocol 1 servers gave up after 30s. */
export const LEGACY_TTL_MS = 30_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 10 * 60_000;

/** Clamp a caller-supplied timeout into [MIN, MAX]; non-numbers get the fallback. */
export function clampTimeout(ms: unknown, fallback: number): number {
  const n = typeof ms === 'number' && Number.isFinite(ms) ? ms : fallback;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
}

/** Error codes the proxy (and the server's own request layer) attach to failures. */
export type RequestErrorCode =
  | 'BUSY'                 // the plugin is serving another request; retry
  | 'PROXY_TTL_EXPIRED'    // the proxy gave up waiting and released the plugin
  | 'SERVER_TIMEOUT'       // the server gave up waiting, and no word came from the proxy
  | 'PLUGIN_DISCONNECTED'  // the plugin's socket closed mid-request
  | 'PROXY_DISCONNECTED'   // the server's socket to the proxy closed mid-request
  | 'NO_PLUGIN'            // no Figma plugin is connected
  | 'NOT_CONNECTED'        // the server has no link to a proxy or plugin right now
  | 'NOT_REGISTERED'
  | 'PLUGIN_ERROR';        // the plugin answered with an error
