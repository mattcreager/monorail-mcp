#!/usr/bin/env node

/**
 * Monorail WebSocket Proxy
 *
 * Sits between Figma plugin instances (downstream, port 9876) and MCP server
 * instances (upstream, port 9877), so several Claude sessions can share one
 * plugin.
 *
 * Downstream routing: by fileKey if present, else most-recently-connected.
 *
 * Each plugin serves one request at a time. The others wait their turn in a
 * FIFO queue, each with its own deadline (its timeoutMs, counted from arrival,
 * or 30s for senders that give none); protocol 3 senders hear `queued` while
 * they wait. The proxy no longer answers `busy`. The
 * request in flight is tracked by id with a TTL (whatever is left of its
 * deadline), so a reply that never comes releases the plugin, and the sender
 * hears why. A write keeps the plugin past its TTL (up to WRITE_HOLD_MS) so two
 * edits never interleave. See docs/proxy-wedge-2026-09.md.
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION, RESPONSE_FOR, REQUEST_TYPES, RESPONSE_TYPES, WRITE_REQUEST_TYPES,
  WRITE_HOLD_MS, LEGACY_TTL_MS, clampTimeout, type RequestErrorCode,
} from "../shared/protocol.js";

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

const VERSION = "0.3.0";
const DOWNSTREAM_PORT = envInt("MONORAIL_WS_PORT", 9876);
const UPSTREAM_PORT = envInt("MONORAIL_PROXY_PORT", 9877);
const HEARTBEAT_MS = envInt("MONORAIL_HEARTBEAT_MS", 15000) || 15000;
/** Heartbeats a socket may miss before it is treated as dead and terminated. */
const MAX_MISSED_PONGS = 2;
const HISTORY_LIMIT = 10;
/** Requests waiting at once, across all sessions. */
const QUEUE_LIMIT = envInt("MONORAIL_QUEUE_LIMIT", 64);
/** How long a queued request waits for a plugin when none is connected (a plugin reconnecting takes ~0.5s). */
const NO_PLUGIN_WAIT_MS = envInt("MONORAIL_NO_PLUGIN_WAIT_MS", 3000);
const WRITE_HOLD = envInt("MONORAIL_WRITE_HOLD_MS", WRITE_HOLD_MS);
const startedAt = Date.now();

function log(...args: unknown[]): void {
  console.error(new Date().toISOString(), "[Proxy]", ...args);
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// --- Types ---

interface Downstream {
  ws: WebSocket;
  id: string;
  fileKey: string | null;
  fileName: string | null;
  pageName: string | null;
  pluginName: string | null;
  pluginVersion: string | null;
  features: string[];
  connectedAt: number;
  missedPongs: number;
  /** Wire id of the request this plugin is serving, if any. */
  inflightId: string | null;
}

interface Upstream {
  ws: WebSocket;
  id: string;
  label: string;
  protocol: number;
  connectedAt: number;
  lastActivity: number;
}

type ReqState = "queued" | "inflight" | "overdue" | "done";

interface Req {
  /** Id the proxy put on the request it sent the plugin (a fresh one per dispatch). Unique per proxy. */
  wireId: string;
  /** Id the upstream put on its request, echoed on the reply; null for protocol 1 senders. */
  requestId: string | null;
  type: string;
  responseType: string;
  write: boolean;
  /** The request as its sender sent it, minus the fields the proxy owns. */
  body: Record<string, unknown>;
  fileKey: string | null;
  upstreamId: string;
  upstreamWs: WebSocket;
  label: string;
  arrivedAt: number;
  /** arrivedAt + timeoutMs: the sender stops waiting then, so the proxy does too. */
  deadline: number;
  timeoutMs: number;
  state: ReqState;
  timer: ReturnType<typeof setTimeout> | null;
  downstreamId: string | null;
  startedAt: number;
  ttlMs: number;
  /** The sender disconnected: nobody is waiting for the reply. */
  abandoned: boolean;
  /** The sender has already been told this request failed (its TTL ran out). */
  notified: boolean;
  requeued: number;
  noPluginSince: number | null;
}

interface HistoryEntry {
  type: string;
  label: string;
  requestId: string | null;
  ageMs: number;
  at: string;
  note?: string;
}

// --- State ---

const downstreams = new Map<string, Downstream>();
const upstreams = new Map<string, Upstream>();
/** Every upstream socket, registered or not, for the heartbeat. */
const upstreamSockets = new Map<WebSocket, { missedPongs: number }>();
const inflight = new Map<string, Req>();
const queue: Req[] = [];
const recentExpired: HistoryEntry[] = [];
const recentLate: HistoryEntry[] = [];
let orphanReplies = 0;
let activeUpstreamId: string | null = null;
let nextId = 1;

function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

function remember(list: HistoryEntry[], entry: HistoryEntry): void {
  list.unshift(entry);
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
}

function sendJson(ws: WebSocket, obj: unknown): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    log("send failed:", (e as Error).message);
    return false;
  }
}

function sendError(
  ws: WebSocket, requestId: string | null, requestType: string | null,
  code: RequestErrorCode, retryable: boolean, message: string,
): void {
  sendJson(ws, {
    type: "error", code, retryable, message,
    ...(requestId ? { requestId } : {}),
    ...(requestType ? { requestType } : {}),
  });
}

function broadcastUpstream(payload: string): void {
  for (const u of upstreams.values()) {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(payload);
  }
}

// --- Downstream routing ---

function routable(d: Downstream): boolean {
  return d.ws.readyState === WebSocket.OPEN;
}

function findDownstream(fileKey?: string | null): Downstream | null {
  let best: Downstream | null = null;
  for (const d of downstreams.values()) {
    if (!routable(d)) continue;
    if (fileKey && d.fileKey === fileKey) return d;
    if (!best || d.connectedAt > best.connectedAt) best = d;
  }
  return best;
}

function noPluginMessage(fileKey: unknown): string {
  return "No Figma plugin connected" + (typeof fileKey === "string" && fileKey ? ` for file ${fileKey}` : "") +
    ". Run the Monorail plugin in Figma.";
}

// --- Request bookkeeping ---

function holderSummary(e: Req, now = Date.now()) {
  const ageMs = now - e.startedAt;
  return {
    type: e.type,
    label: e.label,
    upstreamId: e.upstreamId,
    downstreamId: e.downstreamId,
    requestId: e.requestId,
    state: e.state,
    abandoned: e.abandoned,
    ageMs,
    ttlMs: e.ttlMs,
    expiresInMs: e.state === "overdue"
      ? Math.max(0, e.ttlMs + WRITE_HOLD - ageMs)
      : Math.max(0, e.ttlMs - ageMs),
  };
}

function holderText(h: ReturnType<typeof holderSummary>): string {
  return h.state === "overdue"
    ? `${h.type} from "${h.label}", ${secs(h.ageMs - h.ttlMs)} past its TTL (a write the plugin may still be applying; released within ${secs(h.expiresInMs)})`
    : `${h.type} from "${h.label}" for ${secs(h.ageMs)}, released within ${secs(h.expiresInMs)}`;
}

function queueSummary(now = Date.now()) {
  return queue.map((r, i) => ({
    position: i + 1, type: r.type, label: r.label, requestId: r.requestId,
    waitedMs: now - r.arrivedAt, deadlineInMs: Math.max(0, r.deadline - now),
    waitingForPlugin: r.noPluginSince !== null,
  }));
}

function release(r: Req): void {
  if (r.timer) clearTimeout(r.timer);
  r.timer = null;
  inflight.delete(r.wireId);
  if (r.downstreamId) {
    const ds = downstreams.get(r.downstreamId);
    if (ds && ds.inflightId === r.wireId) ds.inflightId = null;
  }
  r.state = "done";
}

function dequeue(r: Req): void {
  const i = queue.indexOf(r);
  if (i >= 0) queue.splice(i, 1);
  if (r.timer) clearTimeout(r.timer);
  r.timer = null;
  r.state = "done";
}

/** Tell the upstream that sent `r` that it failed, if it is still waiting. */
function failReq(r: Req, code: RequestErrorCode, retryable: boolean, message: string): void {
  if (r.abandoned) return;
  sendError(r.upstreamWs, r.requestId, r.type, code, retryable, message);
}

function newReq(msg: any, upstream: Upstream, ws: WebSocket, label: string, timeoutMs: number): Req {
  // The proxy owns these on the way to the plugin.
  const { requestId, clientLabel: _c, timeoutMs: _t, ...body } = msg;
  const now = Date.now();
  return {
    wireId: "", requestId: typeof requestId === "string" ? requestId : null,
    type: msg.type, responseType: RESPONSE_FOR[msg.type], write: WRITE_REQUEST_TYPES.has(msg.type),
    body, fileKey: typeof msg.fileKey === "string" ? msg.fileKey : null,
    upstreamId: upstream.id, upstreamWs: ws, label,
    arrivedAt: now, deadline: now + timeoutMs, timeoutMs,
    state: "queued", timer: null, downstreamId: null, startedAt: 0, ttlMs: 0,
    abandoned: false, notified: false, requeued: 0, noPluginSince: null,
  };
}

function dispatch(r: Req, target: Downstream, ttlMs: number): void {
  const now = Date.now();
  r.wireId = genId("px");
  r.state = "inflight";
  r.downstreamId = target.id;
  r.startedAt = now;
  r.ttlMs = ttlMs;
  if (r.timer) clearTimeout(r.timer);
  r.timer = setTimeout(() => expire(r.wireId), ttlMs);
  inflight.set(r.wireId, r);
  target.inflightId = r.wireId;
  if (upstreams.get(r.upstreamId)?.ws === r.upstreamWs) activeUpstreamId = r.upstreamId;

  // The plugin sees the proxy's id, so ids from different sessions can't
  // collide, and the time it has, so its own queue gives up when we do.
  if (!sendJson(target.ws, { ...r.body, type: r.type, requestId: r.wireId, clientLabel: r.label, timeoutMs: ttlMs })) {
    release(r);
    failReq(r, "PLUGIN_DISCONNECTED", true, "monorail proxy: could not send to the Figma plugin (its socket is closing).");
  }
}

let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let pumping = false;

/** Hand queued requests to free plugins, oldest first. */
function pump(): void {
  if (pumping) return;
  pumping = true;
  try {
    const now = Date.now();
    let recheckAt = Infinity;
    for (const r of [...queue]) {
      if (r.state !== "queued") continue;
      const target = findDownstream(r.fileKey);
      if (!target) {
        r.noPluginSince ??= now;
        const giveUpAt = r.noPluginSince + NO_PLUGIN_WAIT_MS;
        if (now >= giveUpAt) {
          dequeue(r);
          failReq(r, "NO_PLUGIN", true, noPluginMessage(r.fileKey));
        } else {
          recheckAt = Math.min(recheckAt, giveUpAt);
        }
        continue;
      }
      r.noPluginSince = null;
      if (target.inflightId) continue;
      const remaining = r.deadline - now;
      // Don't start work that can't finish in time: for a write, the sender
      // would hear "may have been applied" about an edit that then lands anyway.
      const floor = Math.min(r.timeoutMs / 4, r.write ? 5000 : 1000);
      if (remaining < floor) {
        dequeue(r);
        failReq(r, "QUEUE_TIMEOUT", true,
          `monorail proxy: ${r.type} waited ${secs(now - r.arrivedAt)} in the queue and only ${secs(Math.max(0, remaining))} of its ${secs(r.timeoutMs)} was left, ` +
          `too little to start it. Nothing was sent to Figma. Retry, with a longer timeout_ms if the plugin is busy.`);
        continue;
      }
      dequeue(r);
      dispatch(r, target, remaining);
    }
    if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = null; }
    if (Number.isFinite(recheckAt)) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, Math.max(10, recheckAt - Date.now()));
  } finally {
    pumping = false;
  }
}

function enqueue(r: Req): void {
  queue.push(r);
  r.timer = setTimeout(() => queueTimeout(r), Math.max(0, r.deadline - Date.now()));
  pump();
}

function queueTimeout(r: Req): void {
  if (r.state !== "queued") return;
  const waited = Date.now() - r.arrivedAt;
  const target = findDownstream(r.fileKey);
  const holder = target?.inflightId ? inflight.get(target.inflightId) : undefined;
  const ahead = queue.indexOf(r);
  dequeue(r);
  failReq(r, "QUEUE_TIMEOUT", true,
    `monorail proxy: ${r.type} waited its whole ${secs(r.timeoutMs)} in the queue and never reached the plugin ` +
    `(${holder ? `held by ${holderText(holderSummary(holder))}` : "no plugin free"}${ahead > 0 ? `, ${ahead} ahead of it` : ""}). ` +
    `Nothing was sent to Figma. Retry, or pass a longer timeout_ms.`);
  log(`Queue timeout: ${r.type} from "${r.label}" after ${secs(waited)}`);
}

function expire(wireId: string): void {
  const r = inflight.get(wireId);
  if (!r) return;
  const now = Date.now();
  const ageMs = now - r.startedAt;

  if (r.state === "overdue") {
    // A write that never answered, even with the extra time: let everyone back in.
    release(r);
    remember(recentExpired, { type: r.type, label: r.label, requestId: r.requestId, ageMs, at: new Date().toISOString(), note: `write held the plugin ${secs(WRITE_HOLD)} past its TTL, then was given up` });
    log(`Gave up on write ${r.type} from "${r.label}" after ${secs(ageMs)}; plugin ${r.downstreamId} released`);
    pump();
    return;
  }

  remember(recentExpired, { type: r.type, label: r.label, requestId: r.requestId, ageMs, at: new Date().toISOString(), ...(r.write ? { note: "write: the plugin stays held until it answers" } : {}) });
  const ds = r.downstreamId ? downstreams.get(r.downstreamId) : undefined;
  if (r.write && ds) {
    // Letting the next request in now could interleave two edits in the
    // plugin. Keep it until the plugin answers, it disconnects, or WRITE_HOLD.
    r.state = "overdue";
    r.timer = setTimeout(() => expire(wireId), WRITE_HOLD);
    log(`TTL expired: ${r.type} from "${r.label}" after ${secs(ageMs)} (ttl ${secs(r.ttlMs)}); a write, so plugin ${r.downstreamId} stays held for up to ${secs(WRITE_HOLD)} more`);
    if (!r.abandoned) {
      r.notified = true;
      failReq(r, "PROXY_TTL_EXPIRED", true,
        `monorail proxy: the Figma plugin did not answer ${r.type} within ${secs(r.ttlMs)} (proxy TTL). ` +
        `It may still be applying it, so check Figma before retrying. Other requests wait until it answers (at most ${secs(WRITE_HOLD)} more).`);
    }
    return;
  }

  release(r);
  log(`TTL expired: ${r.type} from "${r.label}" after ${secs(ageMs)} (ttl ${secs(r.ttlMs)}); plugin ${r.downstreamId} released`);
  if (!r.abandoned) {
    r.notified = true;
    failReq(r, "PROXY_TTL_EXPIRED", true,
      `monorail proxy: the Figma plugin did not answer ${r.type} within ${secs(r.ttlMs)} (proxy TTL). ` +
      `The proxy released the plugin for other requests. The plugin may still be working on it, or its handler ended without replying.`);
  }
  pump();
}

// --- Servers ---
//
// Bind the upstream port first, then the downstream port. When several MCP servers
// find no proxy and each spawns one, they race: binding one port at a time
// means the loser fails on the first port and exits without holding the
// second, so the race can't leave each proxy with one port and neither usable.

function listen(port: number, name: string): Promise<WebSocketServer[]> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port });
    const onError = (err: NodeJS.ErrnoException) => { wss.close(); reject(err); };
    wss.once("error", onError);
    wss.once("listening", () => {
      wss.off("error", onError);
      wss.on("error", (err) => log(`${name} server error:`, err.message));
      resolve([wss]);
    });
  });
}

let upstreamServers: WebSocketServer[];
let downstreamServers: WebSocketServer[];

try {
  upstreamServers = await listen(UPSTREAM_PORT, "upstream");
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === "EADDRINUSE") {
    log(`port ${UPSTREAM_PORT} is taken, so another proxy is already running; exiting`);
    process.exit(0);
  }
  log(`cannot listen on ${UPSTREAM_PORT}:`, err.message);
  process.exit(1);
}
try {
  downstreamServers = await listen(DOWNSTREAM_PORT, "downstream");
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  log(`cannot listen on ${DOWNSTREAM_PORT} (${err.code ?? err.message}): another process holds the plugin port ` +
    `(\`lsof -nP -iTCP:${DOWNSTREAM_PORT} -sTCP:LISTEN\` names it; a direct-mode MCP server, or an older proxy?). Exiting.`);
  for (const s of upstreamServers) s.close();
  process.exit(1);
}

log(`monorail-proxy ${VERSION} (protocol ${PROTOCOL_VERSION}), pid ${process.pid}`);
log(`Downstream (Figma) listening on ws://localhost:${DOWNSTREAM_PORT}`);
log(`Upstream (MCP servers) listening on ws://localhost:${UPSTREAM_PORT}`);

// --- Downstream (Figma plugin) connections ---

function onDownstreamConnection(ws: WebSocket): void {
  const id = genId("ds");
  const downstream: Downstream = {
    ws, id, fileKey: null, fileName: null, pageName: null,
    pluginName: null, pluginVersion: null, features: [],
    connectedAt: Date.now(), missedPongs: 0, inflightId: null,
  };
  downstreams.set(id, downstream);
  log(`Figma plugin connected: ${id}`);

  const helloForUpstreams = () => ({
    type: "hello",
    plugin: downstream.pluginName || "monorail-figma",
    version: downstream.pluginVersion || "0.1.0",
    fileKey: downstream.fileKey,
    fileName: downstream.fileName,
    features: downstream.features,
  });

  ws.on("pong", () => { downstream.missedPongs = 0; });

  ws.on("message", (data) => {
    downstream.missedPongs = 0;
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "hello") {
        downstream.fileKey = msg.fileKey || null;
        downstream.fileName = msg.fileName || null;
        downstream.pageName = msg.pageName || null;
        downstream.pluginName = msg.plugin || null;
        downstream.pluginVersion = msg.version || null;
        downstream.features = Array.isArray(msg.features) ? msg.features.filter((f: unknown) => typeof f === "string") : [];
        log(`Plugin ${id} hello: ${downstream.pluginName} ${downstream.pluginVersion} file=${downstream.fileName} key=${downstream.fileKey} features=[${downstream.features.join(",")}]`);

        sendJson(ws, {
          type: "hello-ack",
          server: "monorail-proxy",
          version: VERSION,
          protocol: PROTOCOL_VERSION,
          timestamp: new Date().toISOString(),
          upstreamCount: upstreams.size,
          activeLabel: activeUpstreamId ? upstreams.get(activeUpstreamId)?.label : null,
        });

        // Every session should see the plugin, not only the last one to make a request.
        broadcastUpstream(JSON.stringify(helloForUpstreams()));
        pump();
        return;
      }

      if (msg.type === "ping") {
        sendJson(ws, { type: "pong" });
        return;
      }

      if (msg.type === "selection-changed") {
        broadcastUpstream(data.toString());
        return;
      }

      // Replies → the upstream whose request this answers
      if (RESPONSE_TYPES.has(msg.type)) {
        let r: Req | undefined;
        if (typeof msg.requestId === "string") {
          r = inflight.get(msg.requestId);
          if (!r || r.downstreamId !== id || r.responseType !== msg.type) {
            // A reply to a request whose TTL already ran out, or an id we never issued.
            remember(recentLate, { type: msg.type, label: "?", requestId: msg.requestId, ageMs: 0, at: new Date().toISOString(), note: "no request in flight with this id (expired?)" });
            log(`Late reply ${msg.type} (${msg.requestId}) from ${id}: no request in flight with that id; dropped`);
            return;
          }
        } else {
          // A plugin build without request ids: the reply answers whatever this
          // plugin is serving, provided the type fits.
          const current = downstream.inflightId ? inflight.get(downstream.inflightId) : undefined;
          if (current && current.responseType === msg.type) {
            r = current;
          } else {
            orphanReplies++;
            remember(recentLate, { type: msg.type, label: "?", requestId: null, ageMs: 0, at: new Date().toISOString(), note: current ? `plugin is serving ${current.type}` : "nothing in flight" });
            log(`Orphan reply ${msg.type} from ${id} (${current ? `serving ${current.type}` : "nothing in flight"}); dropped`);
            return;
          }
        }

        const ageMs = Date.now() - r.startedAt;
        release(r);
        if (r.abandoned || r.notified) {
          remember(recentLate, { type: msg.type, label: r.label, requestId: r.requestId, ageMs, at: new Date().toISOString(), note: r.notified ? `answered ${secs(ageMs - r.ttlMs)} after its TTL` : "answered after its sender left" });
          log(`Reply ${msg.type} for "${r.label}" after ${secs(ageMs)}: its sender ${r.notified ? "already heard the TTL expire" : "is gone"}; dropped`);
          pump();
          return;
        }
        const up = upstreams.get(r.upstreamId);
        if (!up || up.ws !== r.upstreamWs || up.ws.readyState !== WebSocket.OPEN) {
          log(`Reply ${msg.type} for "${r.label}" arrived after it disconnected; dropped`);
        } else {
          if (r.requestId) msg.requestId = r.requestId;
          else delete msg.requestId;
          up.ws.send(JSON.stringify(msg));
        }
        pump();
        return;
      }

      // Anything else — forward to the active upstream
      if (activeUpstreamId) {
        const upstream = upstreams.get(activeUpstreamId);
        if (upstream && upstream.ws.readyState === WebSocket.OPEN) {
          upstream.ws.send(data.toString());
        }
      }
    } catch (e) {
      log(`Bad message from plugin ${id}:`, (e as Error).message);
    }
  });

  ws.on("close", () => {
    downstreams.delete(id);
    const r = downstream.inflightId ? inflight.get(downstream.inflightId) : undefined;
    if (r) {
      release(r);
      const up = upstreams.get(r.upstreamId);
      const canRetry = !r.write && !r.abandoned && !r.notified && r.requeued === 0 && r.requestId !== null &&
        up?.ws === r.upstreamWs && up.protocol >= 3;
      if (canRetry) {
        // A read can safely run again: wait (within its deadline) for the
        // plugin to reconnect, which the plugin UI does by itself.
        r.requeued++;
        r.state = "queued";
        r.downstreamId = null;
        queue.unshift(r);
        r.timer = setTimeout(() => queueTimeout(r), Math.max(0, r.deadline - Date.now()));
        log(`Plugin ${id} disconnected mid-${r.type}; re-queued it for the next plugin`);
      } else {
        failReq(r, "PLUGIN_DISCONNECTED", true,
          `monorail proxy: the Figma plugin disconnected before answering ${r.type}. ` +
          `If that was an edit, check Figma before retrying: it may have been applied.`);
      }
    }
    log(`Plugin disconnected: ${id} (${downstreams.size} remaining)`);
    pump();
  });

  ws.on("error", (err) => {
    log(`Plugin ${id} error:`, err.message);
  });

  pump();
}

for (const s of downstreamServers) s.on("connection", onDownstreamConnection);

// --- Upstream (MCP server) connections ---

function onUpstreamConnection(ws: WebSocket): void {
  const tempId = genId("us");
  let upstream: Upstream | null = null;
  const beat = { missedPongs: 0 };
  upstreamSockets.set(ws, beat);

  ws.on("pong", () => { beat.missedPongs = 0; });

  ws.on("message", (data) => {
    beat.missedPongs = 0;
    let requestId: string | null = null;
    try {
      const msg = JSON.parse(data.toString());
      requestId = typeof msg.requestId === "string" ? msg.requestId : null;

      // Registration
      if (msg.type === "register") {
        const id = typeof msg.id === "string" && msg.id ? msg.id : tempId;
        const existing = upstreams.get(id);
        if (existing && existing.ws !== ws) {
          // The same server reconnecting before its old socket was noticed dead.
          log(`Upstream ${id} re-registered; dropping its previous socket`);
          existing.ws.terminate();
        }
        upstream = {
          ws, id, label: msg.label || "unknown",
          protocol: typeof msg.protocol === "number" ? msg.protocol : 1,
          connectedAt: Date.now(), lastActivity: Date.now(),
        };
        upstreams.set(id, upstream);
        // First upstream becomes active
        if (!activeUpstreamId || !upstreams.has(activeUpstreamId)) activeUpstreamId = id;
        log(`MCP server registered: ${id} (${upstream.label}, protocol ${upstream.protocol})`);
        sendJson(ws, { type: "registered", id, protocol: PROTOCOL_VERSION, version: VERSION, proxyPid: process.pid });

        // If a plugin is already connected, forward its hello so this upstream
        // gets pluginInfo immediately. This runs for every upstream, not just
        // the active one: the hello goes out on this upstream's own socket.
        const ds = findDownstream();
        if (ds) {
          sendJson(ws, {
            type: "hello",
            plugin: ds.pluginName,
            version: ds.pluginVersion,
            fileKey: ds.fileKey,
            fileName: ds.fileName,
            features: ds.features,
          });
        }
        return;
      }

      // Status query (allowed before registration, for scripts and monitoring)
      if (msg.type === "status-query") {
        const now = Date.now();
        sendJson(ws, {
          type: "status-response",
          ...(requestId ? { requestId } : {}),
          pluginCount: downstreams.size,
          upstreamCount: upstreams.size,
          activeUpstream: activeUpstreamId ? upstreams.get(activeUpstreamId)?.label : null,
          files: [...downstreams.values()]
            .filter(d => d.fileKey)
            .map(d => ({ fileKey: d.fileKey, fileName: d.fileName })),
          protocol: PROTOCOL_VERSION,
          version: VERSION,
          pid: process.pid,
          uptimeMs: now - startedAt,
          plugins: [...downstreams.values()].map(d => ({
            id: d.id, plugin: d.pluginName, version: d.pluginVersion, features: d.features,
            fileName: d.fileName, pageName: d.pageName, connectedAt: new Date(d.connectedAt).toISOString(),
            busy: d.inflightId !== null,
          })),
          upstreams: [...upstreams.values()].map(u => ({
            id: u.id, label: u.label, protocol: u.protocol,
            connectedAt: new Date(u.connectedAt).toISOString(), idleMs: now - u.lastActivity,
          })),
          inflight: [...inflight.values()].map(e => holderSummary(e, now)),
          queue: queueSummary(now),
          recentExpired,
          recentLate,
          orphanReplies,
        });
        return;
      }

      // Claim active slot explicitly (only decides who gets unsolicited plugin messages)
      if (msg.type === "claim") {
        if (upstream && inflight.size === 0) {
          activeUpstreamId = upstream.id;
          log(`Active upstream claimed: ${upstream.label}`);
          sendJson(ws, { type: "claimed", active: true });
        } else {
          sendJson(ws, { type: "claimed", active: false, reason: upstream ? "inflight" : "not registered" });
        }
        return;
      }

      if (!upstream) {
        sendError(ws, requestId, typeof msg.type === "string" ? msg.type : null, "NOT_REGISTERED", false,
          "Not registered. Send { type: 'register', id, label } first.");
        return;
      }

      upstream.lastActivity = Date.now();

      // Request messages → route to downstream
      if (REQUEST_TYPES.has(msg.type)) {
        const label = typeof msg.clientLabel === "string" && msg.clientLabel ? msg.clientLabel : upstream.label;

        // A push without autoApply only shows a toast in the plugin; nothing
        // replies, so holding the plugin for it would lock everyone out.
        if (msg.type === "push-ir" && msg.autoApply === false) {
          const target = findDownstream(msg.fileKey);
          if (!target) { sendError(ws, requestId, msg.type, "NO_PLUGIN", true, noPluginMessage(msg.fileKey)); return; }
          target.ws.send(data.toString());
          return;
        }

        if (queue.length >= QUEUE_LIMIT) {
          sendError(ws, requestId, msg.type, "QUEUE_FULL", true,
            `monorail proxy: ${queue.length} requests are already waiting for the Figma plugin. Retry shortly.`);
          return;
        }
        // Everyone waits in the same queue. Senders from before protocol 3
        // don't know `queued`, so they aren't told; answering them `busy`
        // instead starved them whenever the queue was never empty (2026-09-28).
        const r = newReq(msg, upstream, ws, label, clampTimeout(msg.timeoutMs, LEGACY_TTL_MS));
        enqueue(r);
        if (r.state === "queued" && upstream.protocol >= 3 && requestId) {
          const target = findDownstream(r.fileKey);
          const holder = target?.inflightId ? inflight.get(target.inflightId) : undefined;
          const position = queue.indexOf(r) + 1;
          const h = holder ? holderSummary(holder) : null;
          sendJson(ws, {
            type: "queued", requestId, requestType: r.type, position,
            deadlineInMs: r.timeoutMs,
            ...(h ? { holder: { type: h.type, label: h.label, ageMs: h.ageMs, ttlMs: h.ttlMs, expiresInMs: h.expiresInMs, state: h.state } } : {}),
            message: target
              ? `Queued at position ${position}${h ? ` behind ${holderText(h)}` : ""}. It waits up to ${secs(r.timeoutMs)}.`
              : `Waiting up to ${secs(NO_PLUGIN_WAIT_MS)} for a Figma plugin to connect.`,
          });
        }
        return;
      }

      // Non-request messages (hello-ack forwarding, etc) — route to default downstream
      const target = findDownstream(msg.fileKey);
      if (target && target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(data.toString());
      }
    } catch (e) {
      log(`Bad message from upstream ${upstream?.id || tempId}:`, (e as Error).message);
    }
  });

  ws.on("close", () => {
    upstreamSockets.delete(ws);
    // Its queued requests leave the queue. One the plugin is serving stays in
    // flight until the plugin answers or the TTL runs out: the plugin is still
    // working on it either way.
    for (const r of [...queue]) if (r.upstreamWs === ws) { r.abandoned = true; dequeue(r); }
    for (const r of inflight.values()) if (r.upstreamWs === ws) r.abandoned = true;
    if (!upstream) return;
    // A server that reconnected already replaced this entry; leave the new one alone.
    if (upstreams.get(upstream.id)?.ws === ws) {
      upstreams.delete(upstream.id);
      if (activeUpstreamId === upstream.id) {
        activeUpstreamId = upstreams.size > 0 ? upstreams.keys().next().value ?? null : null;
      }
    }
    log(`MCP server disconnected: ${upstream.id} (${upstreams.size} remaining)`);
  });

  ws.on("error", (err) => {
    log(`Upstream ${upstream?.id || tempId} error:`, err.message);
  });
}

for (const s of upstreamServers) s.on("connection", onUpstreamConnection);

// --- Heartbeat ---
//
// Ping both sides and drop sockets that stop answering. Without this, a
// half-open plugin socket (laptop sleep, a Figma tab gone without a close
// frame) stays "connected": it keeps being picked as the most recent plugin
// and every request sent to it is lost. MCP servers count the pings as
// contact, and drop a link that goes quiet for three heartbeats.

setInterval(() => {
  for (const [id, d] of downstreams) {
    if (d.ws.readyState !== WebSocket.OPEN) { downstreams.delete(id); continue; }
    if (d.missedPongs >= MAX_MISSED_PONGS) {
      log(`Plugin ${id} missed ${d.missedPongs} heartbeats; terminating`);
      d.ws.terminate();
      continue;
    }
    d.missedPongs++;
    d.ws.ping();
  }
  for (const [ws, beat] of upstreamSockets) {
    if (ws.readyState !== WebSocket.OPEN) { upstreamSockets.delete(ws); continue; }
    if (beat.missedPongs >= MAX_MISSED_PONGS) {
      const u = [...upstreams.values()].find((x) => x.ws === ws);
      log(`MCP server ${u?.id ?? "(unregistered)"} missed ${beat.missedPongs} heartbeats; terminating`);
      ws.terminate();
      continue;
    }
    beat.missedPongs++;
    ws.ping();
  }
}, HEARTBEAT_MS);

// --- Shutdown and resilience ---

function shutdown(signal: string): void {
  log(`${signal}: shutting down`);
  for (const s of [...downstreamServers, ...upstreamServers]) s.close();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// One bad message must not take down every session's bridge.
process.on("uncaughtException", (err) => {
  log("uncaught exception:", err.stack || err.message);
});
