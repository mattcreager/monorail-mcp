/**
 * The proxy (src/proxy.ts), driven by raw upstream clients and the fake plugin.
 *
 * Each test starts its own proxy on ephemeral ports. What these pin, and the
 * 2026-09-27 failure each one prevents, is in docs/proxy-wedge-2026-09.md.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { startFakePlugin, RESPONSE_FOR as FAKE_RESPONSE_FOR } from './fake-plugin.js';
import { startProxy, connectUpstream, freePort, portOpen, waitUntil, sleep } from './harness.js';
import { RESPONSE_FOR, LEGACY_TTL_MS } from '../dist/shared/protocol.js';

const cleanups = [];
const later = (fn) => cleanups.push(fn);
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });

async function setup({ plugin: pluginOpts = {}, env } = {}) {
  const proxy = await startProxy({ env });
  later(() => proxy.stop());
  const plugin = pluginOpts === null ? null : startFakePlugin({ port: proxy.wsPort, ...pluginOpts });
  if (plugin) { later(() => plugin.close()); await plugin.ready; }
  const upstream = async (label, opts = {}) => {
    const u = await connectUpstream(proxy.proxyPort, { label, id: `${label}-id`, ...opts });
    later(() => u.close());
    return u;
  };
  return { proxy, plugin, upstream };
}

const reply = (u, requestId, types = null, timeoutMs = 3000) =>
  u.waitFor((m) => m.requestId === requestId && (!types || types.includes(m.type)), timeoutMs);

describe('protocol table', () => {
  test('the fake plugin answers with the same reply types the proxy expects', () => {
    assert.deepEqual(FAKE_RESPONSE_FOR, RESPONSE_FOR);
  });
});

describe('waiting for the plugin', () => {
  test('a request from an older sender waits its turn too, without hearing queued', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 500 } });
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    a.send({ type: 'get-css', nodeId: 'n1', requestId: 'a1', timeoutMs: 5000, clientLabel: 'www@tmux pid 1' });
    await sleep(50);
    b.send({ type: 'get-css', nodeId: 'n2', requestId: 'b1', timeoutMs: 5000 });
    const st = await b.status();
    assert.equal(st.inflight[0].label, 'www@tmux pid 1', 'the per-request client label, not just the registration label');
    assert.equal(st.queue.length, 1);
    const done = await reply(a, 'a1');
    assert.equal(done.type, 'css-extracted');
    const rb = await reply(b, 'b1', null, 3000);
    assert.equal(rb.type, 'css-extracted');
    assert.equal(rb.echo.nodeId, 'n2');
    assert.equal(b.messages.filter((m) => m.type === 'busy' || m.type === 'queued').length, 0, 'no busy (it starved them), no queued (they don\'t know it)');
  });

  test('status reports the holder: request type, label and age', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 'never' } });
    const a = await upstream('agent-a');
    a.send({ type: 'apply-probe', action: 'eval', nodeId: 'x', requestId: 'a1', timeoutMs: 8000, clientLabel: 'agent-a pid 7' });
    await sleep(120);
    const st = await a.status();
    assert.equal(st.inflight.length, 1);
    const h = st.inflight[0];
    assert.equal(h.type, 'apply-probe');
    assert.equal(h.label, 'agent-a pid 7');
    assert.ok(h.ageMs >= 0 && h.ageMs < 5000, `age ${h.ageMs}`);
    await sleep(100);
    assert.ok((await a.status()).inflight[0].ageMs >= h.ageMs + 90, 'the age is live');
    assert.ok(h.ttlMs <= 8000 && h.ttlMs > 7900, `ttl ${h.ttlMs}: what was left of its 8s when it reached the plugin`);
    assert.equal(st.plugins[0].busy, true);
    // The old fields are still there for protocol 1 readers.
    for (const k of ['pluginCount', 'upstreamCount', 'activeUpstream', 'files']) assert.ok(k in st, k);
  });
});

describe('TTL', () => {
  test('a request the plugin never answers is released at its TTL and reported to its sender', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 50 } });
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    const sent = Date.now();
    a.send({ type: 'get-css', nodeId: 'hang', requestId: 'a1', timeoutMs: 1000 });
    const expired = await reply(a, 'a1', null, 4000);
    assert.equal(expired.type, 'error');
    assert.equal(expired.code, 'PROXY_TTL_EXPIRED');
    assert.equal(expired.retryable, true);
    assert.match(expired.message, /did not answer get-css within 1\.0s \(proxy TTL\)/);
    const took = expired.at - sent;
    assert.ok(took >= 950 && took < 3000, `expired after ${took}ms`);

    b.send({ type: 'get-css', nodeId: 'ok', requestId: 'b1', timeoutMs: 1000 });
    assert.equal((await reply(b, 'b1')).type, 'css-extracted', 'the plugin is free again');

    const st = await b.status();
    assert.equal(st.recentExpired.length, 1);
    assert.equal(st.recentExpired[0].type, 'get-css');
    assert.equal(st.recentExpired[0].label, 'agent-a');
  });

  test('a request without timeoutMs (protocol 1) gets the legacy 30s TTL', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 'never' } });
    const a = await upstream('legacy');
    a.send({ type: 'get-css', nodeId: 'x' });
    await sleep(50);
    const st = await a.status();
    assert.ok(st.inflight[0].ttlMs <= LEGACY_TTL_MS && st.inflight[0].ttlMs > LEGACY_TTL_MS - 100, `ttl ${st.inflight[0].ttlMs}`);
    assert.equal(LEGACY_TTL_MS, 30000);
  });

  test('a late reply after the TTL is dropped, not handed to the next request', async () => {
    const { upstream, plugin } = await setup();
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    a.send({ type: 'get-css', nodeId: 'slow:1600', requestId: 'a1', timeoutMs: 1000 });
    assert.equal((await reply(a, 'a1', null, 3000)).code, 'PROXY_TTL_EXPIRED');
    // b's request is in flight when a's reply finally arrives (at 1.6s).
    b.send({ type: 'get-css', nodeId: 'slow:900', requestId: 'b1', timeoutMs: 5000 });
    const got = await reply(b, 'b1', ['css-extracted'], 3000);
    assert.equal(got.echo.nodeId, 'slow:900', 'b got its own reply');
    assert.equal(b.messages.filter((m) => m.type === 'css-extracted').length, 1);
    assert.equal(a.messages.filter((m) => m.type === 'css-extracted').length, 0);
    const st = await b.status();
    assert.equal(st.recentLate.length, 1);
    assert.equal(plugin.replies.length, 2);
  });
});

describe('compatibility', () => {
  test('a protocol 1 sender (no requestId, no timeoutMs) still gets its reply', async () => {
    const { upstream } = await setup();
    const a = await upstream('script');
    a.send({ type: 'export-node', nodeId: '1:2', format: 'SVG' });
    const r = await a.waitFor((m) => m.type === 'node-exported');
    assert.equal(r.success, true);
    assert.equal('requestId' in r, false, 'no proxy-internal id leaks to a sender that sent none');
  });

  test('a plugin build without request ids is matched by reply type', async () => {
    const { upstream } = await setup({ plugin: { echoRequestId: false, delayMs: 30 } });
    const a = await upstream('agent-a');
    a.send({ type: 'get-css', nodeId: 'n', requestId: 'a1', timeoutMs: 2000 });
    const r = await reply(a, 'a1');
    assert.equal(r.type, 'css-extracted');
    assert.equal(r.requestId, 'a1', 'the proxy puts the sender\'s id back');
  });

  test('from a plugin without ids, a reply of the wrong type is an orphan and keeps the lock', async () => {
    const { proxy, upstream } = await setup({ plugin: null });
    const legacyPlugin = new WebSocket(`ws://localhost:${proxy.wsPort}`);
    later(() => legacyPlugin.terminate());
    await new Promise((r) => legacyPlugin.once('open', r));
    legacyPlugin.send(JSON.stringify({ type: 'hello', plugin: 'old', version: '0.1.0' }));
    const a = await upstream('agent-a');
    await waitUntil(async () => (await a.status()).pluginCount === 1);
    a.send({ type: 'get-css', nodeId: 'n', requestId: 'a1', timeoutMs: 3000 });
    await sleep(50);
    legacyPlugin.send(JSON.stringify({ type: 'nodes-found', success: true, nodes: [] }));
    await sleep(50);
    const st = await a.status();
    assert.equal(st.inflight.length, 1, 'still waiting for css-extracted');
    assert.equal(st.orphanReplies, 1);
    legacyPlugin.send(JSON.stringify({ type: 'css-extracted', success: true, css: {}, raw: { name: 'n' } }));
    assert.equal((await reply(a, 'a1')).type, 'css-extracted');
  });
});

describe('concurrent upstreams', () => {
  test('eight older senders, five requests each: every reply reaches its own sender, one at a time at the plugin', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 15 } });
    const sessions = await Promise.all(Array.from({ length: 8 }, (_, i) => upstream(`s${i}`)));
    const run = async (u, i) => {
      for (let j = 0; j < 5; j++) {
        const nodeId = `s${i}-n${j}`;
        u.send({ type: 'get-css', nodeId, requestId: nodeId, timeoutMs: 8000, clientLabel: `s${i}` });
        const r = await reply(u, nodeId, null, 8000);
        assert.equal(r.type, 'css-extracted');
        assert.equal(r.echo.nodeId, nodeId, 'reply routed to the right request');
      }
    };
    await Promise.all(sessions.map(run));
    assert.equal(plugin.replies.length, 40);
    assert.equal(plugin.stats.maxOutstanding, 1, 'the plugin never served two requests at once');
    for (const u of sessions) assert.equal(u.messages.filter((m) => m.type === 'css-extracted').length, 5);
  });
});

describe('disconnects', () => {
  test('the plugin disconnecting mid-request fails the request at once and frees the lock', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 'never' } });
    const a = await upstream('agent-a');
    a.send({ type: 'patch-elements', patches: { changes: [] }, requestId: 'a1', timeoutMs: 10000 });
    await sleep(50);
    plugin.close();
    const r = await reply(a, 'a1');
    assert.equal(r.code, 'PLUGIN_DISCONNECTED');
    assert.match(r.message, /check Figma before retrying/);
    assert.equal((await a.status()).inflight.length, 0);
  });

  test('with no plugin, an older sender\'s request fails NO_PLUGIN after the short wait', async () => {
    const { upstream } = await setup({ plugin: null, env: { MONORAIL_NO_PLUGIN_WAIT_MS: '300' } });
    const a = await upstream('agent-a');
    a.send({ type: 'get-css', requestId: 'a1', timeoutMs: 5000 });
    const r = await reply(a, 'a1', null, 1500);
    assert.equal(r.code, 'NO_PLUGIN');
  });

  test('a sender disconnecting mid-request keeps the plugin until it answers', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 400 } });
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    a.send({ type: 'get-css', nodeId: 'n', requestId: 'a1', timeoutMs: 5000 });
    await sleep(50);
    a.close();
    await sleep(50);
    assert.equal((await b.status()).inflight.length, 1, 'the plugin is still working on a\'s request');
    b.send({ type: 'get-css', nodeId: 'm', requestId: 'b1', timeoutMs: 5000 });
    const r = await reply(b, 'b1', null, 3000);
    assert.equal(r.type, 'css-extracted');
    assert.equal(r.echo.nodeId, 'm');
  });

  test('a sender disconnecting while queued leaves the queue', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 300 } });
    const a = await p3(upstream, 'agent-a');
    const b = await p3(upstream, 'agent-b');
    a.send({ type: 'get-css', nodeId: 'first', requestId: 'a1', timeoutMs: 5000 });
    await waitUntil(() => plugin.requests.length === 1);
    b.send({ type: 'get-css', nodeId: 'gone', requestId: 'b1', timeoutMs: 5000 });
    await reply(b, 'b1', ['queued']);
    b.close();
    await waitUntil(async () => (await a.status()).queue.length === 0, { what: 'the queue to empty' });
    await reply(a, 'a1', ['css-extracted']);
    await sleep(100);
    assert.deepEqual(plugin.requests.map((r) => r.nodeId), ['first']);
  });

  test('a server re-registering with the same id replaces its old socket', async () => {
    const { upstream } = await setup();
    const first = await upstream('mcp', { id: 'mcp-42' });
    const second = await upstream('mcp', { id: 'mcp-42' });
    await waitUntil(() => first.ws.readyState === WebSocket.CLOSED, { what: 'the old socket to be dropped' });
    await sleep(50); // the old socket's close handler has run
    const st = await second.status();
    assert.equal(st.upstreamCount, 1);
    second.send({ type: 'get-css', nodeId: 'n', requestId: 's1', timeoutMs: 2000 });
    assert.equal((await reply(second, 's1')).type, 'css-extracted');
  });

  test('a plugin socket that stops answering pings is dropped', async () => {
    const { proxy, upstream } = await setup({ plugin: null, env: { MONORAIL_HEARTBEAT_MS: '100' } });
    const deaf = new WebSocket(`ws://localhost:${proxy.wsPort}`, { autoPong: false });
    later(() => deaf.terminate());
    await new Promise((r) => deaf.once('open', r));
    const a = await upstream('agent-a');
    assert.equal((await a.status()).pluginCount, 1);
    await waitUntil(() => deaf.readyState === WebSocket.CLOSED, { timeoutMs: 2000, what: 'the proxy to drop the deaf socket' });
    await waitUntil(async () => (await a.status()).pluginCount === 0, { what: 'the proxy to forget it' });
  });
});

describe('other traffic', () => {
  test('push-ir without autoApply takes no lock (the plugin never replies to it)', async () => {
    const { upstream, plugin } = await setup({ plugin: { respond: () => null } });
    const a = await upstream('agent-a');
    a.send({ type: 'push-ir', ir: { slides: [] }, autoApply: false, requestId: 'p1' });
    await waitUntil(() => plugin.requests.length === 1);
    assert.equal((await a.status()).inflight.length, 0);
  });

  test('hello and selection reach every session, not only the last requester', async () => {
    const { proxy, upstream } = await setup({ plugin: null });
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    const plugin = startFakePlugin({ port: proxy.wsPort });
    later(() => plugin.close());
    await a.waitFor((m) => m.type === 'hello');
    await b.waitFor((m) => m.type === 'hello');
    const pws = new WebSocket(`ws://localhost:${proxy.wsPort}`);
    later(() => pws.terminate());
    await new Promise((r) => pws.once('open', r));
    pws.send(JSON.stringify({ type: 'selection-changed', count: 1, nodes: [{ id: '1:1' }] }));
    await a.waitFor((m) => m.type === 'selection-changed');
    await b.waitFor((m) => m.type === 'selection-changed');
  });

  test('two proxies started at once: one keeps both ports, the other exits', async () => {
    const wsPort = await freePort();
    const proxyPort = await freePort();
    const { spawn } = await import('node:child_process');
    const { DIST } = await import('./harness.js');
    const path = await import('node:path');
    const env = { ...process.env, MONORAIL_WS_PORT: String(wsPort), MONORAIL_PROXY_PORT: String(proxyPort) };
    const kids = [0, 1].map(() => spawn(process.execPath, [path.join(DIST, 'src', 'proxy.js')], { env, stdio: 'ignore' }));
    later(async () => { for (const k of kids) if (k.exitCode === null) k.kill(); });
    const exits = kids.map((k) => new Promise((r) => k.once('exit', (code) => r(code))));
    const firstExit = await Promise.race([...exits, sleep(3000).then(() => 'none')]);
    assert.equal(firstExit, 0, 'the loser exits cleanly');
    const alive = kids.filter((k) => k.exitCode === null);
    assert.equal(alive.length, 1);
    assert.ok(await portOpen(wsPort));
    assert.ok(await portOpen(proxyPort));
    const u = await connectUpstream(proxyPort, { register: false });
    later(() => u.close());
    assert.equal((await u.status()).pid, alive[0].pid, 'the survivor holds both ports');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol 3: a queue instead of busy, cancel, and writes that hold the plugin.

const p3 = (upstream, label, opts = {}) => upstream(label, { protocol: 3, ...opts });

describe('queue (protocol 3 senders)', () => {
  test('a request behind another waits its turn, hears queued with the holder, then gets its reply', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 300 } });
    const a = await p3(upstream, 'agent-a');
    const b = await p3(upstream, 'agent-b');
    a.send({ type: 'get-css', nodeId: 'n1', requestId: 'a1', timeoutMs: 5000, clientLabel: 'www@tmux pid 1' });
    await waitUntil(() => plugin.requests.length === 1);
    b.send({ type: 'get-css', nodeId: 'n2', requestId: 'b1', timeoutMs: 5000 });
    const q = await reply(b, 'b1', ['queued', 'busy']);
    assert.equal(q.type, 'queued', 'a protocol 3 sender is queued, not told busy');
    assert.equal(q.position, 1);
    assert.equal(q.holder.type, 'get-css');
    assert.equal(q.holder.label, 'www@tmux pid 1');
    assert.match(q.message, /Queued at position 1 behind get-css from "www@tmux pid 1" for \d\.\ds, released within \d\.\ds\. It waits up to 5\.0s\./);
    const st = await b.status();
    assert.equal(st.queue.length, 1);
    assert.equal(st.queue[0].label, 'agent-b');
    const ra = await reply(a, 'a1', ['css-extracted']);
    const rb = await reply(b, 'b1', ['css-extracted'], 3000);
    assert.equal(rb.echo.nodeId, 'n2');
    assert.ok(rb.at >= ra.at, 'b is answered after a');
    assert.equal(plugin.stats.maxOutstanding, 1);
  });

  test('requests are served in the order they arrived', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 60 } });
    const clients = await Promise.all([0, 1, 2, 3, 4].map((i) => p3(upstream, `c${i}`)));
    for (const [i, c] of clients.entries()) { c.send({ type: 'get-css', nodeId: `n${i}`, requestId: `r${i}`, timeoutMs: 5000 }); await sleep(5); }
    await Promise.all(clients.map((c, i) => reply(c, `r${i}`, ['css-extracted'], 3000)));
    assert.deepEqual(plugin.requests.map((r) => r.nodeId), ['n0', 'n1', 'n2', 'n3', 'n4']);
  });

  test('eight sessions, five requests each, no retries: every one is served, one at a time', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 10 } });
    const sessions = await Promise.all(Array.from({ length: 8 }, (_, i) => p3(upstream, `s${i}`)));
    const run = async (u, i) => {
      for (let j = 0; j < 5; j++) {
        u.send({ type: 'get-css', nodeId: `s${i}-n${j}`, requestId: `s${i}-${j}`, timeoutMs: 10000 });
        const r = await reply(u, `s${i}-${j}`, ['css-extracted', 'busy', 'error'], 8000);
        assert.equal(r.type, 'css-extracted', JSON.stringify(r));
        assert.equal(r.echo.nodeId, `s${i}-n${j}`);
      }
    };
    await Promise.all(sessions.map(run));
    assert.equal(plugin.replies.length, 40);
    assert.equal(plugin.stats.maxOutstanding, 1);
    for (const u of sessions) assert.equal(u.messages.filter((m) => m.type === 'busy').length, 0);
  });

  test('a queued request that runs out of time fails with QUEUE_TIMEOUT and never reaches the plugin', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 0 } });
    const holder = await upstream('holder');
    holder.send({ type: 'get-css', nodeId: 'hang', requestId: 'h1', timeoutMs: 8000, clientLabel: 'holder pid 9' });
    await waitUntil(() => plugin.requests.length === 1);
    const b = await p3(upstream, 'agent-b');
    const sent = Date.now();
    b.send({ type: 'get-css', nodeId: 'mine', requestId: 'b1', timeoutMs: 1200 });
    const r = await reply(b, 'b1', ['error'], 3000);
    assert.equal(r.code, 'QUEUE_TIMEOUT');
    assert.equal(r.retryable, true);
    assert.match(r.message, /waited its whole 1\.2s in the queue and never reached the plugin \(held by get-css from "holder pid 9" for \d\.\ds, released within \d\.\ds\)/);
    assert.match(r.message, /Nothing was sent to Figma/);
    assert.ok(r.at - sent >= 1150 && r.at - sent < 2500, `took ${r.at - sent}ms`);
    assert.equal(plugin.requests.length, 1, 'b never reached the plugin');
  });

  test('a request that would start with too little time left fails instead of starting', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 0 } });
    const holder = await upstream('holder');
    holder.send({ type: 'get-css', nodeId: 'slow:1700', requestId: 'h1', timeoutMs: 8000 });
    await waitUntil(() => plugin.requests.length === 1);
    const b = await p3(upstream, 'agent-b');
    // A write with 2s: when the holder finishes at 1.7s, 0.3s is less than a quarter of it.
    b.send({ type: 'delete-slides', slideIds: [], requestId: 'b1', timeoutMs: 2000 });
    const r = await reply(b, 'b1', ['error', 'slides-deleted'], 4000);
    assert.equal(r.code, 'QUEUE_TIMEOUT');
    assert.match(r.message, /too little to start it\. Nothing was sent to Figma/);
    assert.equal(plugin.requests.length, 1);
  });

  test('with no plugin, a request waits briefly for one, then fails NO_PLUGIN', async () => {
    const { upstream } = await setup({ plugin: null, env: { MONORAIL_NO_PLUGIN_WAIT_MS: '600' } });
    const a = await p3(upstream, 'agent-a');
    const sent = Date.now();
    a.send({ type: 'get-css', requestId: 'a1', timeoutMs: 5000 });
    const r = await reply(a, 'a1', ['error'], 3000);
    assert.equal(r.code, 'NO_PLUGIN');
    assert.ok(r.at - sent >= 550 && r.at - sent < 2000, `took ${r.at - sent}ms`);
  });

  test('a plugin that connects during that wait gets the request', async () => {
    const { proxy, upstream } = await setup({ plugin: null });
    const a = await p3(upstream, 'agent-a');
    a.send({ type: 'get-css', nodeId: 'late-plugin', requestId: 'a1', timeoutMs: 5000 });
    assert.equal((await reply(a, 'a1', ['queued'])).type, 'queued');
    await sleep(300);
    const plugin = startFakePlugin({ port: proxy.wsPort });
    later(() => plugin.close());
    const r = await reply(a, 'a1', ['css-extracted', 'error'], 3000);
    assert.equal(r.type, 'css-extracted');
  });

  test('a read in flight when the plugin disconnects is re-queued and answered after it reconnects', async () => {
    let pl = null;
    const { upstream, plugin } = await setup({ plugin: { reconnect: true, reconnectMs: 150, respond: (msg) => (pl.connections < 2 ? null : { delayMs: 0 }) } });
    pl = plugin;
    const a = await p3(upstream, 'agent-a');
    a.send({ type: 'get-css', nodeId: 'n', requestId: 'a1', timeoutMs: 5000 });
    await waitUntil(() => plugin.requests.length === 1);
    plugin.drop();
    const r = await reply(a, 'a1', ['css-extracted', 'error'], 4000);
    assert.equal(r.type, 'css-extracted', JSON.stringify(r));
    assert.equal(plugin.requests.length, 2);
    assert.notEqual(plugin.requests[0].requestId, plugin.requests[1].requestId, 'a fresh wire id, so the first attempt\'s reply could never be taken for it');
  });

  test('a write in flight when the plugin disconnects fails: it may have been applied', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 'never', reconnect: true } });
    const a = await p3(upstream, 'agent-a');
    a.send({ type: 'reorder-slides', slideIds: [], requestId: 'a1', timeoutMs: 5000 });
    await waitUntil(() => plugin.requests.length === 1);
    plugin.drop();
    const r = await reply(a, 'a1', ['error']);
    assert.equal(r.code, 'PLUGIN_DISCONNECTED');
    assert.match(r.message, /check Figma before retrying/);
  });

  test('a protocol 1 sender (no id) queues behind protocol 3 requests and gets its reply', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 200 } });
    const a = await p3(upstream, 'agent-a');
    a.send({ type: 'get-css', nodeId: 'n', requestId: 'a1', timeoutMs: 5000 });
    a.send({ type: 'get-css', nodeId: 'n2', requestId: 'a2', timeoutMs: 5000 });
    await waitUntil(() => plugin.requests.length === 1);
    const legacy = await upstream('script');
    legacy.send({ type: 'get-css', nodeId: 'x' });
    const r = await legacy.waitFor((m) => m.type === 'css-extracted', 3000);
    assert.equal(r.echo.nodeId, 'x');
    assert.equal('requestId' in r, false);
    assert.deepEqual(plugin.requests.map((q) => q.nodeId), ['n', 'n2', 'x'], 'in arrival order');
  });

  test('a full queue says so', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 'never' }, env: { MONORAIL_QUEUE_LIMIT: '2' } });
    const a = await p3(upstream, 'agent-a');
    for (const n of [1, 2, 3, 4]) a.send({ type: 'get-css', nodeId: 'hang', requestId: `a${n}`, timeoutMs: 5000 });
    const r = await reply(a, 'a4', ['error']);
    assert.equal(r.code, 'QUEUE_FULL');
  });
});

describe('writes past their TTL', () => {
  test('the sender hears the TTL ran out, and the plugin stays held until the write answers', async () => {
    const { upstream, plugin } = await setup({ plugin: { respond: (msg) => ({ delayMs: msg.type === 'patch-elements' ? 1500 : 0 }) } });
    const a = await p3(upstream, 'agent-a');
    const b = await p3(upstream, 'agent-b');
    a.send({ type: 'patch-elements', patches: { changes: [] }, requestId: 'a1', timeoutMs: 1000 });
    const expired = await reply(a, 'a1', ['error'], 3000);
    assert.equal(expired.code, 'PROXY_TTL_EXPIRED');
    assert.match(expired.message, /may still be applying it, so check Figma before retrying\. Other requests wait until it answers/);
    b.send({ type: 'get-css', nodeId: 'after', requestId: 'b1', timeoutMs: 5000 });
    assert.equal((await reply(b, 'b1', ['queued', 'css-extracted'])).type, 'queued');
    const st = await b.status();
    assert.equal(st.inflight[0].state, 'overdue');
    const r = await reply(b, 'b1', ['css-extracted'], 3000);
    assert.equal(r.echo.nodeId, 'after');
    assert.equal(plugin.stats.maxOutstanding, 1, 'the read never ran alongside the edit');
    assert.equal(a.messages.filter((m) => m.type === 'patched').length, 0, 'the late reply is not handed to anyone');
    assert.match((await b.status()).recentLate[0].note, /after its TTL/);
  });

  test('a write that never answers is given up WRITE_HOLD after its TTL', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 'never' }, env: { MONORAIL_WRITE_HOLD_MS: '500' } });
    const a = await p3(upstream, 'agent-a');
    const b = await p3(upstream, 'agent-b');
    a.send({ type: 'apply-primitives', operations: [], requestId: 'a1', timeoutMs: 1000 });
    await reply(a, 'a1', ['error'], 3000);
    const sent = Date.now();
    b.send({ type: 'get-css', nodeId: 'hang', requestId: 'b1', timeoutMs: 5000 });
    await waitUntil(async () => { const st = await b.status(); return st.inflight.length === 1 && st.inflight[0].type === 'get-css'; },
      { timeoutMs: 2000, what: 'b to reach the plugin' });
    assert.ok(Date.now() - sent >= 350, 'not before the hold ran out');
    const st = await b.status();
    assert.match(st.recentExpired.find((e) => e.type === 'apply-primitives' && /given up/.test(e.note ?? ''))?.note ?? '', /held the plugin 0\.5s past its TTL/);
  });

  test('a read is released at its TTL, as before', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 'never' } });
    const a = await p3(upstream, 'agent-a');
    a.send({ type: 'get-css', nodeId: 'hang', requestId: 'a1', timeoutMs: 1000 });
    assert.equal((await reply(a, 'a1', ['error'], 3000)).code, 'PROXY_TTL_EXPIRED');
    assert.equal((await a.status()).inflight.length, 0);
  });
});
