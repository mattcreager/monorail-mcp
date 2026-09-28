/**
 * Test plumbing for the proxy and the MCP server: free ports, a proxy child
 * process, raw upstream clients, and an MCP client over stdio.
 *
 * Everything runs on ephemeral ports, so tests never touch a live proxy on
 * 9876/9877 or the Figma plugin connected to it. The token and the pairing
 * flag live in a fresh MONORAIL_HOME per test process (never ~/.monorail),
 * which every proxy and server started from here inherits.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '..');
export const DIST = path.join(REPO, 'dist');

if (!process.env.MONORAIL_HOME) {
  process.env.MONORAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'monorail-test-'));
  const home = process.env.MONORAIL_HOME;
  process.once('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ } });
}

const auth = await import(path.join(DIST, 'src', 'auth.js'));
/** The token this test process's proxies and servers share. */
export const token = () => auth.readOrCreateToken();
/** The code a plugin must send to pair. */
export const pairingCode = () => auth.pairingCodeFor(auth.readOrCreateToken());

/** A separate MONORAIL_HOME (for tests that turn pairing on), with its token and pairing code. */
export function freshHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'monorail-test-'));
  process.once('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ } });
  const prev = process.env.MONORAIL_HOME;
  process.env.MONORAIL_HOME = home;
  try {
    const tok = auth.readOrCreateToken();
    return { home, token: tok, code: auth.pairingCodeFor(tok) };
  } finally {
    process.env.MONORAIL_HOME = prev;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, 'localhost');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

export async function waitUntil(pred, { timeoutMs = 5000, stepMs = 25, what = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await sleep(stepMs);
  }
}

/**
 * Spawn a proxy on the given ports and wait until both are listening. With no
 * ports given it picks free ones, and picks again if another process takes
 * one before the proxy binds it (a race between parallel test files).
 */
export async function startProxy({ wsPort, proxyPort, dist = DIST, env = {} } = {}) {
  const pick = wsPort === undefined && proxyPort === undefined;
  for (let attempt = 0; ; attempt++) {
    const ws = wsPort ?? await freePort();
    let px = proxyPort ?? await freePort();
    while (px === ws) px = await freePort();
    try {
      return await spawnProxy(ws, px, dist, env);
    } catch (e) {
      if (!pick || attempt >= 3 || !/is taken|cannot listen/.test(e.message)) throw e;
    }
  }
}

async function spawnProxy(wsPort, proxyPort, dist, env) {
  const logs = [];
  const child = spawn(process.execPath, [path.join(dist, 'src', 'proxy.js')], {
    env: { ...process.env, MONORAIL_WS_PORT: String(wsPort), MONORAIL_PROXY_PORT: String(proxyPort), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  try {
    await waitUntil(async () => {
      if (child.exitCode !== null) throw new Error('the proxy exited');
      return (await portOpen(proxyPort)) && (await portOpen(wsPort));
    }, { what: 'proxy to listen' });
  } catch (e) {
    child.kill();
    await new Promise((r) => setTimeout(r, 50)); // let its last log line arrive
    throw new Error(`${e.message} (ports ${proxyPort}/${wsPort}, exit ${child.exitCode ?? child.signalCode}): ${logs.join('').slice(-800)}`);
  }
  return {
    child, wsPort, proxyPort, logs,
    async stop(signal = 'SIGTERM') {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((r) => child.once('exit', r));
      child.kill(signal);
      await exited;
    },
  };
}

/**
 * A raw upstream client, the way an MCP server or a script talks to the proxy.
 * It registers with the token unless `token: null`; `protocol: 3` asks for
 * queueing instead of busy.
 */
export async function connectUpstream(port, { id, label = 'test', register = true, token: tok = token(), protocol, headers } = {}) {
  const ws = new WebSocket(`ws://localhost:${port}`, headers ? { headers } : undefined);
  const messages = [];
  const waiters = [];
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    msg.at = Date.now();
    messages.push(msg);
    for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(msg); }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const client = {
    ws, messages,
    send(obj) { ws.send(JSON.stringify(obj)); },
    /** Resolve with the first message (already received or future) matching pred. */
    waitFor(pred, timeoutMs = 3000, { past = true } = {}) {
      if (past) { const hit = messages.find(pred); if (hit) return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`no matching message within ${timeoutMs}ms`)); }, timeoutMs) };
        waiters.push(w);
      });
    },
    async status({ withToken = true } = {}) {
      const sent = Date.now();
      client.send({ type: 'status-query', ...(withToken ? { token: tok ?? token() } : {}) });
      return client.waitFor((m) => m.type === 'status-response' && m.at >= sent, 2000, { past: false });
    },
    close() { ws.terminate(); },
  };
  if (register) {
    client.send({ type: 'register', id: id ?? `${label}-${Math.random().toString(36).slice(2, 8)}`, label, ...(tok ? { token: tok } : {}), ...(protocol ? { protocol } : {}) });
    await client.waitFor((m) => m.type === 'registered' || (m.type === 'error' && m.requestType === 'register'));
  }
  return client;
}

/** Start an MCP server (dist/src/index.js) and connect an MCP client to it over stdio. */
export async function startMcp({ dist = DIST, env = {}, label = 'mcp-test' } = {}) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(dist, 'src', 'index.js')],
    env: { ...process.env, MONORAIL_HOST_LABEL: label, ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'monorail-test', version: '0.0.0' });
  await client.connect(transport);
  transport.stderr?.on('data', (d) => stderr.push(d.toString()));
  return {
    client, stderr,
    pid: transport.pid,
    async call(name, args = {}, { timeoutMs = 120000 } = {}) {
      const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
      return { text: res.content.map((c) => c.text ?? '').join('\n'), isError: !!res.isError };
    },
    async close() { await client.close(); },
  };
}
