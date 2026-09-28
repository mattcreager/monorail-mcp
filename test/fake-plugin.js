/**
 * A fake Figma plugin for exercising the proxy and the MCP server without Figma.
 *
 * It connects to the proxy's downstream port (ws://localhost:9876 by default),
 * says hello the way figma-plugin/ui.html does, and answers every request with
 * the response type the real plugin would send, after a configurable delay, or
 * never.
 *
 * Per-request behaviour comes from `nodeId`, so a test can mix outcomes on one
 * plugin:
 *   nodeId "hang"        → never answer (a handler that died without replying)
 *   nodeId "slow:<ms>"   → answer after <ms>
 *   anything else        → answer after the plugin's `delayMs` (default 0;
 *                          Infinity or "never" means never answer)
 * A `respond(msg)` option overrides all of that: return `null` to stay silent,
 * or `{ delayMs, payload }`.
 *
 * `echoRequestId: false` imitates a plugin build from before request ids, which
 * answers without them. `reconnect: true` imitates the auto-reconnecting UI.
 * `features` adds to the hello's feature list (e.g. 'cancel', 'pairing'), and
 * `pairingCode` is sent in the hello the way a paired plugin does.
 * `headers` are sent on the handshake (e.g. an Origin).
 *
 * Library:  import { startFakePlugin } from './fake-plugin.js'
 * CLI:      node test/fake-plugin.js [--port 9876] [--delay 500|never] [--legacy] [--reconnect]
 */

import WebSocket from 'ws';
import { pathToFileURL } from 'node:url';

/** Request type → the response type the real plugin sends back. */
export const RESPONSE_FOR = {
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

/** A plausible success payload for each request, carrying an echo of the request. */
function defaultPayload(msg) {
  const echo = { nodeId: msg.nodeId ?? null, requestId: msg.requestId ?? null, clientLabel: msg.clientLabel ?? null };
  const type = RESPONSE_FOR[msg.type];
  switch (msg.type) {
    case 'get-css':
      return { type, success: true, css: { width: '10px' }, raw: { name: `node ${msg.nodeId}`, type: 'FRAME', width: 10, height: 10 }, echo };
    case 'apply-probe':
      return { type, action: msg.action, success: true, result: { node: msg.nodeId ?? null }, echo };
    case 'request-export':
      return { type, ir: { deck: { title: 'Fake deck' }, slides: [] }, echo };
    case 'push-ir':
      return { type, count: 0, created: 0, updated: 0, skipped: 0, echo };
    case 'export-node':
      return { type, success: true, nodeId: msg.nodeId, nodeName: `node ${msg.nodeId}`, format: msg.format || 'SVG', data: '<svg/>', width: 1, height: 1, echo };
    default:
      return { type, success: true, echo };
  }
}

function plannedDelay(msg, delayMs) {
  const id = typeof msg.nodeId === 'string' ? msg.nodeId : '';
  if (id === 'hang') return Infinity;
  const slow = /^slow:(\d+)$/.exec(id);
  if (slow) return Number(slow[1]);
  if (delayMs === 'never') return Infinity;
  return delayMs;
}

export function startFakePlugin({
  port = Number(process.env.MONORAIL_WS_PORT || 9876),
  delayMs = 0,
  echoRequestId = true,
  reconnect = false,
  reconnectMs = 100,
  respond = null,
  name = 'fake-plugin',
  features = [],
  pairingCode = null,
  headers = undefined,
  log = () => {},
} = {}) {
  const requests = [];
  const replies = [];
  /** Everything else the proxy sent: hello-ack, pair-result, cancel. */
  const control = [];
  const timers = new Set();
  // How many requests the plugin is working on at once. The proxy should
  // never let this pass 1 for requests it answers.
  const stats = { outstanding: 0, maxOutstanding: 0 };
  let ws = null;
  let closed = false;
  let connections = 0;
  let resolveReady;
  let ready = new Promise((r) => { resolveReady = r; });

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function connect() {
    const sock = new WebSocket(`ws://localhost:${port}`, headers ? { headers } : undefined);
    ws = sock;
    sock.on('open', () => {
      connections++;
      sock.send(JSON.stringify({ type: 'hello', plugin: name, version: '0.0.0-fake', fileKey: null, fileName: 'Fake file', pageName: 'Page 1', features: [...(echoRequestId ? ['request-id'] : []), ...features], ...(pairingCode ? { pairingCode } : {}) }));
      log(`[${name}] connected (#${connections})`);
      resolveReady();
    });
    sock.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!RESPONSE_FOR[msg.type]) { control.push({ ...msg, receivedAt: Date.now() }); return; } // hello-ack, pair-result, cancel
      requests.push({ ...msg, receivedAt: Date.now() });
      log(`[${name}] ← ${msg.type} ${msg.nodeId ?? ''} ${msg.requestId ?? ''}`);
      const plan = respond ? respond(msg) : { delayMs: plannedDelay(msg, delayMs), payload: defaultPayload(msg) };
      if (!plan || !Number.isFinite(plan.delayMs ?? 0)) return; // never answer
      stats.outstanding++;
      stats.maxOutstanding = Math.max(stats.maxOutstanding, stats.outstanding);
      const payload = { ...(plan.payload ?? defaultPayload(msg)) };
      if (echoRequestId && msg.requestId) payload.requestId = msg.requestId;
      else delete payload.requestId;
      const t = setTimeout(() => {
        timers.delete(t);
        stats.outstanding--;
        replies.push(payload);
        // Answer on whichever socket is current, like the real UI does after a reconnect.
        send(payload);
        log(`[${name}] → ${payload.type}`);
      }, plan.delayMs ?? 0);
      timers.add(t);
    });
    sock.on('close', () => {
      if (ws === sock) ws = null;
      if (closed || !reconnect) return;
      ready = new Promise((r) => { resolveReady = r; });
      const t = setTimeout(() => { timers.delete(t); if (!closed) connect(); }, reconnectMs);
      timers.add(t);
    });
    sock.on('error', () => { /* close follows; reconnect handles it */ });
  }

  connect();

  return {
    requests,
    replies,
    control,
    stats,
    send,
    get ready() { return ready; },
    get connected() { return !!ws && ws.readyState === WebSocket.OPEN; },
    get connections() { return connections; },
    setDelay(ms) { delayMs = ms; },
    /** Drop the socket without stopping (a reconnecting plugin comes back). */
    drop() { ws?.terminate(); },
    close() {
      closed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      ws?.terminate();
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
  const delay = opt('--delay', '0');
  startFakePlugin({
    port: Number(opt('--port', process.env.MONORAIL_WS_PORT || 9876)),
    delayMs: delay === 'never' ? 'never' : Number(delay),
    echoRequestId: !args.includes('--legacy'),
    reconnect: args.includes('--reconnect'),
    log: (line) => console.error(`${new Date().toISOString()} ${line}`),
  });
}
