#!/usr/bin/env node

/**
 * Monorail WebSocket Proxy
 *
 * Sits between Figma plugin instances (downstream, port 9876) and
 * MCP server instances (upstream, port 9877). Routes messages between
 * the active upstream and the targeted downstream.
 *
 * Downstream routing: by fileKey if present, else most-recently-connected.
 * Upstream routing: most-recent requester becomes active; responses go to inflight sender.
 */

import { WebSocketServer, WebSocket } from "ws";

const DOWNSTREAM_PORT = parseInt(process.env.MONORAIL_WS_PORT || "9876", 10);
const UPSTREAM_PORT = parseInt(process.env.MONORAIL_PROXY_PORT || "9877", 10);
const HEARTBEAT_MS = 15000;

// --- Types ---

interface Downstream {
  ws: WebSocket;
  id: string;
  fileKey: string | null;
  fileName: string | null;
  pageName: string | null;
  connectedAt: number;
}

interface Upstream {
  ws: WebSocket;
  id: string;
  label: string;
  lastActivity: number;
}

interface Inflight {
  upstreamId: string;
  downstreamId: string;
}

// --- State ---

const downstreams = new Map<string, Downstream>();
const upstreams = new Map<string, Upstream>();
let activeUpstreamId: string | null = null;
let inflight: Inflight | null = null;
let nextId = 1;

function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

// --- Request type detection ---

const REQUEST_TYPES = new Set([
  "request-export", "push-ir", "patch-elements", "capture-template",
  "instantiate-template", "create-styled-slide", "delete-slides",
  "reorder-slides", "request-screenshot", "apply-primitives", "get-css",
  "export-node", "get-component-info", "find-nodes",
]);

const RESPONSE_TYPES = new Set([
  "exported", "applied", "patched", "template-captured", "instantiated",
  "styled-slide-created", "slides-deleted", "slides-reordered",
  "screenshot-exported", "primitives-applied", "css-extracted",
  "node-exported", "component-info", "nodes-found",
]);

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

// --- Servers ---

const downstreamServer = new WebSocketServer({ port: DOWNSTREAM_PORT });
const upstreamServer = new WebSocketServer({ port: UPSTREAM_PORT });

console.error(`[Proxy] Downstream (Figma) listening on ws://localhost:${DOWNSTREAM_PORT}`);
console.error(`[Proxy] Upstream (MCP servers) listening on ws://localhost:${UPSTREAM_PORT}`);

// --- Downstream (Figma plugin) connections ---

downstreamServer.on("connection", (ws) => {
  const id = genId("ds");
  const downstream: Downstream = {
    ws, id, fileKey: null, fileName: null, pageName: null,
    connectedAt: Date.now(),
  };
  downstreams.set(id, downstream);
  console.error(`[Proxy] Figma plugin connected: ${id}`);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "hello") {
        // Store file identity
        downstream.fileKey = msg.fileKey || null;
        downstream.fileName = msg.fileName || null;
        downstream.pageName = msg.pageName || null;
        console.error(`[Proxy] Plugin ${id} hello: file=${downstream.fileName} key=${downstream.fileKey}`);

        // Respond with hello-ack
        ws.send(JSON.stringify({
          type: "hello-ack",
          server: "monorail-proxy",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
          upstreamCount: upstreams.size,
          activeLabel: activeUpstreamId ? upstreams.get(activeUpstreamId)?.label : null,
        }));

        // Also notify active upstream that a plugin connected
        if (activeUpstreamId) {
          const upstream = upstreams.get(activeUpstreamId);
          if (upstream && upstream.ws.readyState === WebSocket.OPEN) {
            upstream.ws.send(JSON.stringify({
              type: "hello",
              plugin: msg.plugin || "monorail-figma",
              version: msg.version || "0.1.0",
              fileKey: downstream.fileKey,
              fileName: downstream.fileName,
            }));
          }
        }
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (msg.type === "selection-changed") {
        // Forward selection to active upstream
        if (activeUpstreamId) {
          const upstream = upstreams.get(activeUpstreamId);
          if (upstream && upstream.ws.readyState === WebSocket.OPEN) {
            upstream.ws.send(data.toString());
          }
        }
        return;
      }

      // Response messages → route to inflight upstream
      if (RESPONSE_TYPES.has(msg.type)) {
        if (inflight) {
          const upstream = upstreams.get(inflight.upstreamId);
          if (upstream && upstream.ws.readyState === WebSocket.OPEN) {
            upstream.ws.send(data.toString());
          }
          inflight = null;
        } else {
          console.error(`[Proxy] Orphan response (${msg.type}), no inflight request`);
        }
        return;
      }

      // Unknown message — forward to active upstream
      if (activeUpstreamId) {
        const upstream = upstreams.get(activeUpstreamId);
        if (upstream && upstream.ws.readyState === WebSocket.OPEN) {
          upstream.ws.send(data.toString());
        }
      }
    } catch (e) {
      console.error(`[Proxy] Bad message from plugin ${id}:`, (e as Error).message);
    }
  });

  ws.on("close", () => {
    downstreams.delete(id);
    if (inflight?.downstreamId === id) inflight = null;
    console.error(`[Proxy] Plugin disconnected: ${id} (${downstreams.size} remaining)`);
  });

  ws.on("error", (err) => {
    console.error(`[Proxy] Plugin ${id} error:`, err.message);
  });
});

// --- Upstream (MCP server) connections ---

upstreamServer.on("connection", (ws) => {
  const tempId = genId("us");
  let upstream: Upstream | null = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Registration
      if (msg.type === "register") {
        const id = msg.id || tempId;
        upstream = { ws, id, label: msg.label || "unknown", lastActivity: Date.now() };
        upstreams.set(id, upstream);
        // First upstream becomes active
        if (!activeUpstreamId) activeUpstreamId = id;
        console.error(`[Proxy] MCP server registered: ${id} (${upstream.label})`);
        ws.send(JSON.stringify({ type: "registered", id }));
        return;
      }

      // Status query
      if (msg.type === "status-query") {
        ws.send(JSON.stringify({
          type: "status-response",
          pluginCount: downstreams.size,
          upstreamCount: upstreams.size,
          activeUpstream: activeUpstreamId ? upstreams.get(activeUpstreamId)?.label : null,
          files: [...downstreams.values()]
            .filter(d => d.fileKey)
            .map(d => ({ fileKey: d.fileKey, fileName: d.fileName })),
        }));
        return;
      }

      // Claim active slot explicitly
      if (msg.type === "claim") {
        if (upstream && !inflight) {
          activeUpstreamId = upstream.id;
          console.error(`[Proxy] Active upstream claimed: ${upstream.label}`);
          ws.send(JSON.stringify({ type: "claimed", active: true }));
        } else {
          ws.send(JSON.stringify({ type: "claimed", active: false, reason: inflight ? "inflight" : "not registered" }));
        }
        return;
      }

      if (!upstream) {
        ws.send(JSON.stringify({ type: "error", message: "Not registered. Send { type: 'register', id, label } first." }));
        return;
      }

      upstream.lastActivity = Date.now();

      // Request messages → route to downstream
      if (REQUEST_TYPES.has(msg.type)) {
        // Inflight lock
        if (inflight) {
          ws.send(JSON.stringify({ type: "busy", message: "Another session has an inflight request. Retry shortly." }));
          return;
        }

        // Find target downstream
        const target = findDownstream(msg.fileKey);
        if (!target) {
          ws.send(JSON.stringify({ type: "error", message: "No Figma plugin connected" + (msg.fileKey ? ` for file ${msg.fileKey}` : "") }));
          return;
        }

        // Set active, set inflight, forward
        activeUpstreamId = upstream.id;
        inflight = { upstreamId: upstream.id, downstreamId: target.id };
        target.ws.send(data.toString());
        return;
      }

      // Non-request messages (hello-ack forwarding, etc) — route to default downstream
      const target = findDownstream(msg.fileKey);
      if (target && target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(data.toString());
      }
    } catch (e) {
      console.error(`[Proxy] Bad message from upstream ${tempId}:`, (e as Error).message);
    }
  });

  ws.on("close", () => {
    if (upstream) {
      upstreams.delete(upstream.id);
      if (activeUpstreamId === upstream.id) {
        activeUpstreamId = upstreams.size > 0 ? upstreams.keys().next().value ?? null : null;
      }
      if (inflight?.upstreamId === upstream.id) inflight = null;
      console.error(`[Proxy] MCP server disconnected: ${upstream.id} (${upstreams.size} remaining)`);
    }
  });

  ws.on("error", (err) => {
    console.error(`[Proxy] Upstream ${upstream?.id || tempId} error:`, err.message);
  });
});

// --- Heartbeat ---

setInterval(() => {
  for (const [id, d] of downstreams) {
    if (d.ws.readyState !== WebSocket.OPEN) {
      downstreams.delete(id);
    }
  }
  for (const [id, u] of upstreams) {
    if (u.ws.readyState !== WebSocket.OPEN) {
      upstreams.delete(id);
      if (activeUpstreamId === id) {
        activeUpstreamId = upstreams.size > 0 ? upstreams.keys().next().value ?? null : null;
      }
    } else {
      u.ws.ping();
    }
  }
}, HEARTBEAT_MS);

// --- Graceful shutdown ---

process.on("SIGINT", () => {
  console.error("[Proxy] Shutting down...");
  downstreamServer.close();
  upstreamServer.close();
  process.exit(0);
});
