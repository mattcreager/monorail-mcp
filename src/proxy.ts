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
 * Each plugin serves one request at a time: the Figma plugin sandbox is single
 * threaded, and a reply from an older plugin build can only be matched to "the
 * request in flight". The request in flight is tracked by id with a TTL (the
 * sender's timeoutMs, else LEGACY_TTL_MS), so a reply that never comes releases
 * the plugin when the TTL runs out, and the sender hears why. A request that
 * arrives while the plugin is serving another gets an immediate `busy` naming
 * the holder, never silence. See docs/proxy-wedge-2026-09.md.
 *
 * Protocol 1 clients (requests without requestId/timeoutMs) keep working.
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION, RESPONSE_FOR, REQUEST_TYPES, RESPONSE_TYPES,
  LEGACY_TTL_MS, clampTimeout, type RequestErrorCode,
} from "../shared/protocol.js";

const VERSION = "0.2.0";
const DOWNSTREAM_PORT = parseInt(process.env.MONORAIL_WS_PORT || "9876", 10);
const UPSTREAM_PORT = parseInt(process.env.MONORAIL_PROXY_PORT || "9877", 10);
const HEARTBEAT_MS = parseInt(process.env.MONORAIL_HEARTBEAT_MS || "15000", 10);
/** Heartbeats a socket may miss before it is treated as dead and terminated. */
const MAX_MISSED_PONGS = 2;
const BUSY_RETRY_AFTER_MS = 250;
const HISTORY_LIMIT = 10;
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
  connectedAt: number;
  lastActivity: number;
  missedPongs: number;
}

interface Inflight {
  /** Id the proxy put on the request it sent the plugin. Unique per proxy. */
  wireId: string;
  /** Id the upstream put on its request, echoed on the reply; null for protocol 1 senders. */
  requestId: string | null;
  type: string;
  responseType: string;
  upstreamId: string;
  upstreamWs: WebSocket;
  label: string;
  downstreamId: string;
  startedAt: number;
  ttlMs: number;
  timer: ReturnType<typeof setTimeout>;
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
const inflight = new Map<string, Inflight>();
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

function findDownstream(fileKey?: string | null): Downstream | null {
  if (downstreams.size === 0) return null;

  // By fileKey if provided
  if (fileKey) {
    for (const d of downstreams.values()) {
      if (d.fileKey === fileKey) return d;
    }
  }

  // Fallback: most recently connected
  let best: Downstream | null = null;
  for (const d of downstreams.values()) {
    if (!best || d.connectedAt > best.connectedAt) best = d;
  }
  return best;
}

// --- Inflight bookkeeping ---

function holderSummary(e: Inflight, now = Date.now()) {
  const ageMs = now - e.startedAt;
  return {
    type: e.type,
    label: e.label,
    upstreamId: e.upstreamId,
    downstreamId: e.downstreamId,
    requestId: e.requestId,
    ageMs,
    ttlMs: e.ttlMs,
    expiresInMs: Math.max(0, e.ttlMs - ageMs),
  };
}

function release(e: Inflight): void {
  clearTimeout(e.timer);
  inflight.delete(e.wireId);
  const ds = downstreams.get(e.downstreamId);
  if (ds && ds.inflightId === e.wireId) ds.inflightId = null;
}

/** Tell the upstream that owns `e` that it failed, if that upstream is still there. */
function failInflight(e: Inflight, code: RequestErrorCode, retryable: boolean, message: string): void {
  sendError(e.upstreamWs, e.requestId, e.type, code, retryable, message);
}

function expire(wireId: string): void {
  const e = inflight.get(wireId);
  if (!e) return;
  release(e);
  const ageMs = Date.now() - e.startedAt;
  remember(recentExpired, { type: e.type, label: e.label, requestId: e.requestId, ageMs, at: new Date().toISOString() });
  log(`TTL expired: ${e.type} from "${e.label}" after ${secs(ageMs)} (ttl ${secs(e.ttlMs)}); plugin ${e.downstreamId} released`);
  failInflight(e, "PROXY_TTL_EXPIRED", true,
    `monorail proxy: the Figma plugin did not answer ${e.type} within ${secs(e.ttlMs)} (proxy TTL). ` +
    `The proxy released the plugin for other requests. The plugin may still be working on it, or its handler ended without replying.`);
}

// --- Servers ---
//
// Bind the upstream port first, then the downstream port. When several MCP
// servers find no proxy and each spawns one, they race: binding one port at a
// time means the loser fails on the first port and exits without holding the
// second, so the race can't leave each proxy with one port and neither usable.

function listen(port: number, name: string): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port });
    const onError = (err: NodeJS.ErrnoException) => { wss.close(); reject(err); };
    wss.once("error", onError);
    wss.once("listening", () => {
      wss.off("error", onError);
      wss.on("error", (err) => log(`${name} server error:`, err.message));
      resolve(wss);
    });
  });
}

let upstreamServer: WebSocketServer;
let downstreamServer: WebSocketServer;

try {
  upstreamServer = await listen(UPSTREAM_PORT, "upstream");
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
  downstreamServer = await listen(DOWNSTREAM_PORT, "downstream");
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  log(`cannot listen on ${DOWNSTREAM_PORT} (${err.code ?? err.message}); a direct-mode MCP server may hold it. Exiting.`);
  upstreamServer.close();
  process.exit(1);
}

log(`monorail-proxy ${VERSION} (protocol ${PROTOCOL_VERSION}), pid ${process.pid}`);
log(`Downstream (Figma) listening on ws://localhost:${DOWNSTREAM_PORT}`);
log(`Upstream (MCP servers) listening on ws://localhost:${UPSTREAM_PORT}`);

// --- Downstream (Figma plugin) connections ---

downstreamServer.on("connection", (ws) => {
  const id = genId("ds");
  const downstream: Downstream = {
    ws, id, fileKey: null, fileName: null, pageName: null,
    pluginName: null, pluginVersion: null, features: [],
    connectedAt: Date.now(), missedPongs: 0, inflightId: null,
  };
  downstreams.set(id, downstream);
  log(`Figma plugin connected: ${id}`);

  ws.on("pong", () => { downstream.missedPongs = 0; });

  ws.on("message", (data) => {
    downstream.missedPongs = 0;
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "hello") {
        // Store file identity and plugin info
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
        broadcastUpstream(JSON.stringify({
          type: "hello",
          plugin: msg.plugin || "monorail-figma",
          version: msg.version || "0.1.0",
          fileKey: downstream.fileKey,
          fileName: downstream.fileName,
          features: downstream.features,
        }));
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
        let entry: Inflight | undefined;
        if (typeof msg.requestId === "string") {
          entry = inflight.get(msg.requestId);
          if (!entry) {
            // A reply to a request whose TTL already ran out (or an id we never issued).
            remember(recentLate, { type: msg.type, label: "?", requestId: msg.requestId, ageMs: 0, at: new Date().toISOString(), note: "no request in flight with this id (expired?)" });
            log(`Late reply ${msg.type} (${msg.requestId}) from ${id}: no request in flight with that id; dropped`);
            return;
          }
        } else {
          // A plugin build without request ids: the reply answers whatever this
          // plugin is serving, provided the type fits.
          const current = downstream.inflightId ? inflight.get(downstream.inflightId) : undefined;
          if (current && current.responseType === msg.type) {
            entry = current;
          } else {
            orphanReplies++;
            remember(recentLate, { type: msg.type, label: "?", requestId: null, ageMs: 0, at: new Date().toISOString(), note: current ? `plugin is serving ${current.type}` : "nothing in flight" });
            log(`Orphan reply ${msg.type} from ${id} (${current ? `serving ${current.type}` : "nothing in flight"}); dropped`);
            return;
          }
        }

        release(entry);
        const up = upstreams.get(entry.upstreamId);
        if (!up || up.ws !== entry.upstreamWs || up.ws.readyState !== WebSocket.OPEN) {
          log(`Reply ${msg.type} for "${entry.label}" arrived after it disconnected; dropped`);
          return;
        }
        if (entry.requestId) msg.requestId = entry.requestId;
        else delete msg.requestId;
        up.ws.send(JSON.stringify(msg));
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
    const e = downstream.inflightId ? inflight.get(downstream.inflightId) : undefined;
    if (e) {
      release(e);
      failInflight(e, "PLUGIN_DISCONNECTED", true,
        `monorail proxy: the Figma plugin disconnected before answering ${e.type}. ` +
        `If that was an edit, check Figma before retrying: it may have been applied.`);
    }
    log(`Plugin disconnected: ${id} (${downstreams.size} remaining)`);
  });

  ws.on("error", (err) => {
    log(`Plugin ${id} error:`, err.message);
  });
});

// --- Upstream (MCP server) connections ---

upstreamServer.on("connection", (ws) => {
  const tempId = genId("us");
  let upstream: Upstream | null = null;

  ws.on("pong", () => { if (upstream) upstream.missedPongs = 0; });

  ws.on("message", (data) => {
    if (upstream) upstream.missedPongs = 0;
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
        upstream = { ws, id, label: msg.label || "unknown", connectedAt: Date.now(), lastActivity: Date.now(), missedPongs: 0 };
        upstreams.set(id, upstream);
        // First upstream becomes active
        if (!activeUpstreamId || !upstreams.has(activeUpstreamId)) activeUpstreamId = id;
        log(`MCP server registered: ${id} (${upstream.label})`);
        sendJson(ws, { type: "registered", id, protocol: PROTOCOL_VERSION, version: VERSION, proxyPid: process.pid });

        // If a downstream is already connected, forward its hello so this
        // upstream gets pluginInfo immediately, rather than waiting for a plugin
        // that connected before it registered to say hello again.
        //
        // This deliberately runs for EVERY upstream, not just the active one. It
        // was gated on `activeUpstreamId === id`, which is only ever true for the
        // first server to register — so the second Claude instance, the whole
        // reason this proxy exists, still saw "Plugin: unknown". The gate bought
        // nothing: the hello goes out on `ws`, this upstream's own socket, so
        // there is no cross-talk to prevent.
        const ds = findDownstream();
        if (ds) {
          sendJson(ws, {
            type: "hello",
            // Pass these through as-is. Fabricating a name and version meant
            // reporting a confidently wrong version, which is worse than the
            // "unknown" it was trying to avoid.
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
            id: u.id, label: u.label,
            connectedAt: new Date(u.connectedAt).toISOString(), idleMs: now - u.lastActivity,
          })),
          inflight: [...inflight.values()].map(e => holderSummary(e, now)),
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

        const target = findDownstream(msg.fileKey);
        if (!target || target.ws.readyState !== WebSocket.OPEN) {
          sendError(ws, requestId, msg.type, "NO_PLUGIN", true,
            "No Figma plugin connected" + (msg.fileKey ? ` for file ${msg.fileKey}` : "") +
            ". Run the Monorail plugin in Figma.");
          return;
        }

        // A push without autoApply only shows a toast in the plugin; nothing
        // replies, so holding the plugin for it would lock everyone out.
        if (msg.type === "push-ir" && msg.autoApply === false) {
          target.ws.send(data.toString());
          return;
        }

        // One request at a time per plugin: say who holds it, right away.
        if (target.inflightId) {
          const holder = inflight.get(target.inflightId);
          if (holder) {
            const h = holderSummary(holder);
            sendJson(ws, {
              type: "busy",
              ...(requestId ? { requestId } : {}),
              requestType: msg.type,
              retryable: true,
              retryAfterMs: Math.min(BUSY_RETRY_AFTER_MS, h.expiresInMs || BUSY_RETRY_AFTER_MS),
              holder: { type: h.type, label: h.label, ageMs: h.ageMs, ttlMs: h.ttlMs, expiresInMs: h.expiresInMs },
              message: `Figma plugin busy: ${h.type} from "${h.label}" has been in flight for ${secs(h.ageMs)} ` +
                `(the proxy releases it within ${secs(h.expiresInMs)}). Retry shortly.`,
            });
            return;
          }
          target.inflightId = null; // stale pointer; shouldn't happen
        }

        const wireId = genId("px");
        const ttlMs = clampTimeout(msg.timeoutMs, LEGACY_TTL_MS);
        const entry: Inflight = {
          wireId, requestId, type: msg.type, responseType: RESPONSE_FOR[msg.type],
          upstreamId: upstream.id, upstreamWs: ws, label, downstreamId: target.id,
          startedAt: Date.now(), ttlMs,
          timer: setTimeout(() => expire(wireId), ttlMs),
        };
        inflight.set(wireId, entry);
        target.inflightId = wireId;
        activeUpstreamId = upstream.id;

        // The plugin sees the proxy's id, so ids from different sessions can't collide.
        if (!sendJson(target.ws, { ...msg, requestId: wireId, clientLabel: label })) {
          release(entry);
          sendError(ws, requestId, msg.type, "PLUGIN_DISCONNECTED", true, "monorail proxy: could not send to the Figma plugin (its socket is closing).");
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
    if (!upstream) return;
    // A server that reconnected already replaced this entry; leave the new one alone.
    if (upstreams.get(upstream.id)?.ws === ws) {
      upstreams.delete(upstream.id);
      if (activeUpstreamId === upstream.id) {
        activeUpstreamId = upstreams.size > 0 ? upstreams.keys().next().value ?? null : null;
      }
    }
    // Its requests stay in flight until the plugin answers or the TTL runs out:
    // the plugin is still working on them either way.
    log(`MCP server disconnected: ${upstream.id} (${upstreams.size} remaining)`);
  });

  ws.on("error", (err) => {
    log(`Upstream ${upstream?.id || tempId} error:`, err.message);
  });
});

// --- Heartbeat ---
//
// Ping both sides and drop sockets that stop answering. Without this, a
// half-open plugin socket (laptop sleep, a Figma tab gone without a close
// frame) stays "connected": it keeps being picked as the most recent plugin
// and every request sent to it is lost.

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
  for (const [id, u] of upstreams) {
    if (u.ws.readyState !== WebSocket.OPEN) {
      upstreams.delete(id);
      if (activeUpstreamId === id) {
        activeUpstreamId = upstreams.size > 0 ? upstreams.keys().next().value ?? null : null;
      }
      continue;
    }
    if (u.missedPongs >= MAX_MISSED_PONGS) {
      log(`MCP server ${id} missed ${u.missedPongs} heartbeats; terminating`);
      u.ws.terminate();
      continue;
    }
    u.missedPongs++;
    u.ws.ping();
  }
}, HEARTBEAT_MS);

// --- Shutdown and resilience ---

function shutdown(signal: string): void {
  log(`${signal}: shutting down`);
  downstreamServer.close();
  upstreamServer.close();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// One bad message must not take down every session's bridge.
process.on("uncaughtException", (err) => {
  log("uncaught exception:", err.stack || err.message);
});
