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

describe('busy', () => {
  test('a request while the plugin is serving another gets busy at once, naming the holder', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 500 } });
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    a.send({ type: 'get-css', nodeId: 'n1', requestId: 'a1', timeoutMs: 5000, clientLabel: 'www@tmux pid 1' });
    await sleep(50);
    const sent = Date.now();
    b.send({ type: 'get-css', nodeId: 'n2', requestId: 'b1', timeoutMs: 5000 });
    const busy = await reply(b, 'b1');
    assert.equal(busy.type, 'busy');
    assert.ok(busy.at - sent < 1000, `busy took ${busy.at - sent}ms (immediate, not a silent wait)`);
    assert.equal(busy.retryable, true);
    assert.ok(busy.retryAfterMs > 0);
    assert.equal(busy.requestType, 'get-css');
    assert.equal(busy.holder.type, 'get-css');
    assert.equal(busy.holder.label, 'www@tmux pid 1', 'the per-request client label, not just the registration label');
    assert.ok(busy.holder.ageMs >= 0 && busy.holder.ageMs < 5000);
    assert.ok(busy.holder.expiresInMs <= 5000 - busy.holder.ageMs);
    assert.match(busy.message, /busy: get-css from "www@tmux pid 1"/);

    const done = await reply(a, 'a1');
    assert.equal(done.type, 'css-extracted');
    // Released: b's retry now goes through.
    b.send({ type: 'get-css', nodeId: 'n2', requestId: 'b2', timeoutMs: 5000 });
    assert.equal((await reply(b, 'b2')).type, 'css-extracted');
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
    assert.equal(h.ttlMs, 8000);
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
    assert.equal(st.inflight[0].ttlMs, LEGACY_TTL_MS);
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
  test('eight sessions, five requests each: every reply reaches its own sender, one at a time at the plugin', async () => {
    const { upstream, plugin } = await setup({ plugin: { delayMs: 15 } });
    const sessions = await Promise.all(Array.from({ length: 8 }, (_, i) => upstream(`s${i}`)));
    let busies = 0;
    const run = async (u, i) => {
      for (let j = 0; j < 5; j++) {
        const nodeId = `s${i}-n${j}`;
        for (let attempt = 0; ; attempt++) {
          const requestId = `${nodeId}-try${attempt}`;
          u.send({ type: 'get-css', nodeId, requestId, timeoutMs: 5000, clientLabel: `s${i}` });
          const r = await reply(u, requestId, null, 5000);
          if (r.type === 'busy') { busies++; await sleep(5 + Math.random() * 20); continue; }
          assert.equal(r.type, 'css-extracted');
          assert.equal(r.echo.nodeId, nodeId, 'reply routed to the right request');
          break;
        }
      }
    };
    await Promise.all(sessions.map(run));
    assert.equal(plugin.replies.length, 40);
    assert.equal(plugin.stats.maxOutstanding, 1, 'the plugin never served two requests at once');
    assert.ok(busies > 0, 'contention happened');
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

  test('with no plugin, a request fails at once with NO_PLUGIN', async () => {
    const { upstream } = await setup({ plugin: null });
    const a = await upstream('agent-a');
    a.send({ type: 'get-css', requestId: 'a1', timeoutMs: 5000 });
    const r = await reply(a, 'a1', null, 500);
    assert.equal(r.code, 'NO_PLUGIN');
  });

  test('a sender disconnecting mid-request keeps the plugin locked until it answers', async () => {
    const { upstream } = await setup({ plugin: { delayMs: 400 } });
    const a = await upstream('agent-a');
    const b = await upstream('agent-b');
    a.send({ type: 'get-css', nodeId: 'n', requestId: 'a1', timeoutMs: 5000 });
    await sleep(50);
    a.close();
    await sleep(50);
    b.send({ type: 'get-css', nodeId: 'm', requestId: 'b1', timeoutMs: 5000 });
    assert.equal((await reply(b, 'b1')).type, 'busy', 'the plugin is still working on a\'s request');
    await sleep(450);
    b.send({ type: 'get-css', nodeId: 'm', requestId: 'b2', timeoutMs: 5000 });
    assert.equal((await reply(b, 'b2')).type, 'css-extracted');
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
