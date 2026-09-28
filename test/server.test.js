/**
 * The MCP server (src/index.ts) end to end: an MCP client over stdio, the real
 * proxy, and the fake plugin. Each test uses its own ports and processes.
 *
 * What these pin, and the 2026-09-27 failure each one prevents, is in
 * docs/proxy-wedge-2026-09.md.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import { startFakePlugin } from './fake-plugin.js';
import { startProxy, startMcp, connectUpstream, freePort, portOpen, waitUntil, sleep, REPO, pairingCode, freshHome } from './harness.js';

const cleanups = [];
const later = (fn) => cleanups.push(fn);
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });

function mcpEnv(proxy, extra = {}) {
  return {
    MONORAIL_WS_PORT: String(proxy.wsPort),
    MONORAIL_PROXY_PORT: String(proxy.proxyPort),
    MONORAIL_PROXY_LOG: path.join(REPO, 'tmp', 'test-proxy.log'),
    MONORAIL_RECONNECT_MIN_MS: '50',
    MONORAIL_RECONNECT_MAX_MS: '400',
    MONORAIL_PROXY_SPAWN: '0',
    ...extra,
  };
}

async function setup({ plugin: pluginOpts = {}, env = {}, proxyEnv } = {}) {
  const proxy = await startProxy({ env: proxyEnv });
  later(() => proxy.stop());
  const plugin = pluginOpts === null ? null : startFakePlugin({ port: proxy.wsPort, ...pluginOpts });
  if (plugin) { later(() => plugin.close()); await plugin.ready; }
  const mcp = await startMcp({ env: mcpEnv(proxy, env) });
  later(() => mcp.close());
  const upstream = async (label) => {
    const u = await connectUpstream(proxy.proxyPort, { label, id: label });
    later(() => u.close());
    return u;
  };
  return { proxy, plugin, mcp, upstream };
}

const timed = async (fn) => { const t = Date.now(); const r = await fn(); return { ...r, ms: Date.now() - t }; };

describe('waiting for the plugin', () => {
  test('waits its turn behind another session\'s request, then succeeds', async () => {
    const { mcp, upstream } = await setup();
    const holder = await upstream('holder');
    holder.send({ type: 'get-css', nodeId: 'slow:600', requestId: 'h1', timeoutMs: 5000 });
    await sleep(50);
    const r = await mcp.call('monorail_css', { node_id: 'mine' });
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /CSS for "node mine"/);
  });

  test('behind a holder that never answers, it fails at its own deadline and names the holder', async () => {
    const { mcp, upstream, plugin } = await setup();
    const holder = await upstream('holder');
    holder.send({ type: 'get-css', nodeId: 'hang', requestId: 'h1', timeoutMs: 20000, clientLabel: 'other-session pid 9' });
    await waitUntil(() => plugin.requests.length === 1);
    const r = await timed(() => mcp.call('monorail_css', { node_id: 'x', timeout_ms: 1500 }));
    assert.equal(r.isError, true);
    assert.match(r.text, /waited its whole 1\.5s in the queue and never reached the plugin \(held by get-css from "other-session pid 9"/);
    assert.match(r.text, /Nothing was sent to Figma/);
    assert.ok(r.ms >= 1400 && r.ms < 3500, `took ${r.ms}ms: its own 1.5s, then an answer`);
    assert.equal(plugin.requests.length, 1, 'the call never reached the plugin');
  });

  test('against an older proxy that answers busy, it retries until its own deadline, then names the holder', async () => {
    const wsPort = await freePort();
    const proxyPort = await freePort();
    const old = new WebSocketServer({ port: proxyPort });
    later(() => new Promise((r) => { for (const c of old.clients) c.terminate(); old.close(r); }));
    let busies = 0;
    old.on('connection', (ws) => ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'register') ws.send(JSON.stringify({ type: 'registered', id: m.id, protocol: 2 }));
      else if (m.requestId) { busies++; ws.send(JSON.stringify({ type: 'busy', requestId: m.requestId, retryAfterMs: 100, holder: { type: 'get-css', label: 'old-holder', ageMs: 5000, expiresInMs: 25000 } })); }
    }));
    const mcp = await startMcp({ env: mcpEnv({ wsPort, proxyPort }) });
    later(() => mcp.close());
    const r = await timed(() => mcp.call('monorail_css', { node_id: 'x', timeout_ms: 3000 }));
    assert.equal(r.isError, true);
    assert.match(r.text, /the Figma plugin is busy: get-css from "old-holder" has held it for 5\.0s/);
    assert.match(r.text, /until this call's deadline/);
    assert.ok(r.ms >= 1800 && r.ms < 4500, `took ${r.ms}ms`);
    assert.ok(busies > 5, `retried ${busies}×`);
  });
});

describe('timeouts', () => {
  test('a plugin that never answers: the error says the proxy TTL fired', async () => {
    const { mcp } = await setup();
    const r = await timed(() => mcp.call('monorail_css', { node_id: 'hang', timeout_ms: 1000 }));
    assert.equal(r.isError, true);
    assert.match(r.text, /did not answer get-css within 1\.0s \(proxy TTL\)/);
    assert.ok(r.ms < 4000, `took ${r.ms}ms`);
  });

  test('a proxy that never answers: the error says the server-side timeout fired', async () => {
    const wsPort = await freePort();
    const proxyPort = await freePort();
    const mute = new WebSocketServer({ port: proxyPort });
    later(() => new Promise((r) => { for (const c of mute.clients) c.terminate(); mute.close(r); }));
    mute.on('connection', (ws) => ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'register') ws.send(JSON.stringify({ type: 'registered', id: m.id, protocol: 2 }));
    }));
    const mcp = await startMcp({ env: mcpEnv({ wsPort, proxyPort }) });
    later(() => mcp.close());
    const r = await timed(() => mcp.call('monorail_css', { node_id: 'x', timeout_ms: 1000 }));
    assert.equal(r.isError, true);
    assert.match(r.text, /no reply from the Figma plugin within 3\.0s \(server-side timeout; the proxy should have reported its own 1\.0s TTL first/);
    assert.ok(r.ms >= 2900 && r.ms < 7000, `took ${r.ms}ms`);
  });

  test('requests carry the per-type default timeout, or the caller\'s timeout_ms, and a client label', async () => {
    const { mcp, plugin } = await setup();
    await mcp.call('monorail_css', { node_id: 'a' });
    await mcp.call('monorail_probe', { action: 'eval', code: 'return 1', node_id: 'b' });
    await mcp.call('monorail_css', { node_id: 'c', timeout_ms: 5000 });
    const [css, probe, cssCustom] = plugin.requests;
    // The plugin is told what is left of the deadline when the request reaches it.
    const near = (v, want) => assert.ok(v <= want && v > want - 1000, `${v} ≈ ${want}`);
    near(css.timeoutMs, 90000);
    near(probe.timeoutMs, 120000);
    near(cssCustom.timeoutMs, 5000);
    for (const r of plugin.requests) assert.match(r.clientLabel, /^mcp-test pid \d+$/);
  });
});

describe('request ids', () => {
  test('sibling calls in one server process each get their own reply', async () => {
    const { mcp, plugin } = await setup({ plugin: { delayMs: 30 } });
    const nodes = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    const results = await Promise.all(nodes.map((n) => mcp.call('monorail_css', { node_id: n })));
    results.forEach((r, i) => {
      assert.equal(r.isError, false, r.text);
      assert.match(r.text, new RegExp(`CSS for "node ${nodes[i]}"`), 'no call got another call\'s reply');
    });
    assert.equal(plugin.stats.maxOutstanding, 1);
  });

  test('a late reply to a timed-out call does not resolve the next call', async () => {
    const { mcp } = await setup();
    const a = await mcp.call('monorail_css', { node_id: 'slow:1600', timeout_ms: 1000 });
    assert.match(a.text, /proxy TTL/);
    // The plugin answers a's request at 1.6s, while b's is in flight.
    const b = await mcp.call('monorail_css', { node_id: 'slow:900' });
    assert.equal(b.isError, false, b.text);
    assert.match(b.text, /CSS for "node slow:900"/);
  });

  test('a plugin build without request ids still works', async () => {
    const { mcp } = await setup({ plugin: { echoRequestId: false } });
    const r = await mcp.call('monorail_css', { node_id: 'old' });
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /CSS for "node old"/);
  });
});

describe('reconnect', () => {
  test('after a proxy restart the server reconnects, and an in-flight call fails fast', async () => {
    const proxy = await startProxy();
    let proxy2 = null;
    later(async () => { await proxy.stop(); await proxy2?.stop(); });
    const plugin = startFakePlugin({ port: proxy.wsPort, reconnect: true, reconnectMs: 100 });
    later(() => plugin.close());
    await plugin.ready;
    const mcp = await startMcp({ env: mcpEnv(proxy) });
    later(() => mcp.close());

    assert.equal((await mcp.call('monorail_css', { node_id: 'before' })).isError, false);

    const inflight = timed(() => mcp.call('monorail_css', { node_id: 'slow:3000' }));
    await sleep(100);
    await proxy.stop();
    const cut = await inflight;
    assert.equal(cut.isError, true);
    assert.match(cut.text, /connection to the monorail proxy closed before a reply/);
    assert.ok(cut.ms < 3000, `took ${cut.ms}ms (the call's own timeout was 90s)`);

    proxy2 = await startProxy({ wsPort: proxy.wsPort, proxyPort: proxy.proxyPort });
    const probe = await connectUpstream(proxy2.proxyPort, { register: false });
    later(() => probe.close());
    await waitUntil(async () => { const s = await probe.status(); return s.upstreamCount === 1 && s.pluginCount === 1; },
      { timeoutMs: 5000, what: 'the server and plugin to reconnect' });

    const after = await mcp.call('monorail_css', { node_id: 'after' });
    assert.equal(after.isError, false, after.text);
    assert.match(after.text, /CSS for "node after"/);
  });

  test('with no proxy listening, the server starts one and reconnects to it', async () => {
    const proxy = await startProxy();
    later(() => proxy.stop());
    const plugin = startFakePlugin({ port: proxy.wsPort, reconnect: true, reconnectMs: 100 });
    later(() => plugin.close());
    await plugin.ready;
    const mcp = await startMcp({ env: mcpEnv(proxy, { MONORAIL_PROXY_SPAWN: '1', MONORAIL_SPAWN_COOLDOWN_MS: '0' }) });
    later(() => mcp.close());
    assert.equal((await mcp.call('monorail_css', { node_id: 'before' })).isError, false);

    await proxy.stop();
    let spawnedPid = null;
    later(() => { if (spawnedPid) try { process.kill(spawnedPid); } catch { /* gone */ } });
    await waitUntil(() => portOpen(proxy.proxyPort), { timeoutMs: 5000, what: 'a respawned proxy' });
    const probe = await connectUpstream(proxy.proxyPort, { register: false });
    later(() => probe.close());
    const st = await waitUntil(async () => { const s = await probe.status(); return s.upstreamCount === 1 && s.pluginCount === 1 && s; },
      { timeoutMs: 5000, what: 'the server and plugin on the new proxy' });
    spawnedPid = st.pid;
    assert.notEqual(st.pid, proxy.child.pid);

    const after = await mcp.call('monorail_css', { node_id: 'after' });
    assert.equal(after.isError, false, after.text);
  });
});

describe('monorail_status', () => {
  test('reports the proxy, this session and who holds the plugin', async () => {
    const { mcp, upstream } = await setup();
    const holder = await upstream('holder');
    holder.send({ type: 'apply-probe', action: 'eval', nodeId: 'hang', requestId: 'h1', timeoutMs: 20000, clientLabel: 'holder pid 9' });
    await sleep(100);
    const r = await mcp.call('monorail_status');
    assert.match(r.text, /^✓ Figma plugin connected \(via proxy\)/);
    assert.match(r.text, /Proxy: ws:\/\/localhost:\d+ · pid \d+ · monorail-proxy 0\.3\.0 \(protocol 3\)/);
    assert.match(r.text, /This session: mcp-test pid \d+/);
    assert.match(r.text, /Plugin lock: apply-probe from "holder pid 9" for \d+\.\ds \(released within \d+\.\ds\)/);
  });

  test('says so when the proxy has no plugin, instead of "connected"', async () => {
    const { mcp } = await setup({ plugin: null });
    const r = await mcp.call('monorail_status');
    assert.match(r.text, /^✗ No Figma plugin connected to the proxy/);
    assert.match(r.text, /Plugin lock: free/);
  });

  test('lists a recent TTL expiry', async () => {
    const { mcp } = await setup();
    await mcp.call('monorail_css', { node_id: 'hang', timeout_ms: 1000 });
    const r = await mcp.call('monorail_status');
    assert.match(r.text, /Recent TTL expiries \(the plugin never answered\):\n\s+- get-css from "mcp-test pid \d+" after 1\.\ds/);
  });

  test('status shows the queue', async () => {
    const { mcp, upstream, plugin, proxy } = await setup();
    const holder = await upstream('holder');
    holder.send({ type: 'get-css', nodeId: 'hang', requestId: 'h1', timeoutMs: 20000, clientLabel: 'holder pid 9' });
    await waitUntil(() => plugin.requests.length === 1);
    const waiter = await connectUpstream(proxy.proxyPort, { label: 'waiter', protocol: 3 });
    later(() => waiter.close());
    waiter.send({ type: 'get-css', nodeId: 'x', requestId: 'w1', timeoutMs: 20000, clientLabel: 'waiter pid 8' });
    await waiter.waitFor((m) => m.type === 'queued');
    const r = await mcp.call('monorail_status');
    assert.match(r.text, /Queue: 1 waiting: get-css from "waiter pid 8" for \d+\.\ds/);
  });
});

describe('monorail_probe truncation', () => {
  const probeReply = (payload) => ({ respond: (msg) => ({ delayMs: 0, payload: { type: 'probe-result', action: msg.action, success: true, ...payload } }) });

  test('a cut result starts with a warning', async () => {
    const result = [...Array.from({ length: 50 }, (_, i) => i), '[… 6 more items, 56 in all: raise max_items, or return a string]'];
    const { mcp } = await setup({
      plugin: probeReply({ result, truncated: true, truncation: { arrays: 1, objects: 0, depth: 0, examples: ['$.result: 56 items, kept 50'], limits: { maxItems: 50, maxKeys: 80, depth: 4 } } }),
    });
    const r = await mcp.call('monorail_probe', { action: 'eval', code: 'return 1' });
    assert.match(r.text, /^⚠ Truncated: 1 list cut at 50 items \(\$\.result: 56 items, kept 50\)/);
  });

  test('a reply from an older plugin build with exactly 50 items is flagged as possibly cut', async () => {
    const { mcp } = await setup({ plugin: probeReply({ result: { rows: Array.from({ length: 50 }, (_, i) => i) } }) });
    const r = await mcp.call('monorail_probe', { action: 'eval', code: 'return 1' });
    assert.match(r.text, /^⚠ Possibly truncated: \$\.rows has exactly 50 items/);
  });

  test('max_items, max_keys and max_depth reach the plugin', async () => {
    const { mcp, plugin } = await setup();
    await mcp.call('monorail_probe', { action: 'eval', code: 'return 1', max_items: 500, max_keys: 200, max_depth: 6 });
    const [req] = plugin.requests;
    assert.equal(req.maxItems, 500);
    assert.equal(req.maxKeys, 200);
    assert.equal(req.maxDepth, 6);
  });
});

describe('monorail_push', () => {
  test('with autoApply it waits for the plugin, so a refused push is not reported as done', async () => {
    let refuse = false;
    const { mcp } = await setup({ plugin: { respond: (msg) => ({ delayMs: 0, payload: refuse ? { type: 'applied', success: false, error: 'font missing' } : undefined }) } });
    const ok = await mcp.call('monorail_push', { ir: JSON.stringify({ deck: { title: 't' }, slides: [] }) });
    assert.equal(ok.isError, false, ok.text);
    refuse = true;
    const refused = await mcp.call('monorail_push', { ir: JSON.stringify({ deck: { title: 't' }, slides: [] }) });
    assert.equal(refused.isError, true);
    assert.match(refused.text, /font missing/);
  });
});

describe('cancel', () => {
  test('a cancelled call withdraws its request, so the next session gets the plugin at once', async () => {
    const { proxy, mcp, plugin } = await setup({ plugin: { features: ['cancel'] } });
    const other = await startMcp({ env: mcpEnv(proxy), label: 'other' });
    later(() => other.close());
    const ac = new AbortController();
    const call = mcp.client.callTool({ name: 'monorail_probe', arguments: { action: 'node', node_id: 'hang', timeout_ms: 30000 } }, undefined, { signal: ac.signal, timeout: 60000 })
      .then(() => 'resolved', (e) => `rejected: ${e.message}`);
    await waitUntil(() => plugin.requests.length === 1);
    ac.abort('user pressed Esc');
    assert.match(await call, /rejected/);
    const probe = await connectUpstream(proxy.proxyPort, { register: false });
    later(() => probe.close());
    await waitUntil(async () => (await probe.status()).inflight.length === 0, { timeoutMs: 2000, what: 'the proxy to release the plugin' });
    const r = await timed(() => other.call('monorail_css', { node_id: 'n1' }));
    assert.equal(r.isError, false, r.text);
    assert.ok(r.ms < 2000, `took ${r.ms}ms (was up to the 30s TTL, then BUSY)`);
    assert.ok(plugin.control.some((m) => m.type === 'cancel' && m.requestId === plugin.requests[0].requestId));
  });
});

describe('who may connect', () => {
  test('a server with the wrong token is refused, and says so in status and on every call', async () => {
    const { proxy } = await setup();
    const stranger = await startMcp({ env: mcpEnv(proxy, { MONORAIL_HOME: freshHome().home }), label: 'stranger' });
    later(() => stranger.close());
    const st = await stranger.call('monorail_status');
    assert.match(st.text, /^✗ The monorail proxy refused this session: monorail proxy: wrong token/);
    const r = await stranger.call('monorail_css', { node_id: 'x' });
    assert.equal(r.isError, true);
    assert.match(r.text, /wrong token/);
  });

  test('status prints the pairing code while the plugin can pair but has not', async () => {
    const { mcp } = await setup({ plugin: { features: ['pairing', 'serial'] } });
    const r = await mcp.call('monorail_status');
    assert.match(r.text, /· not paired/);
    const m = /Pairing: not set up\. .*paste this code into the Monorail plugin window \(Pair\): ([0-9a-f-]+)/.exec(r.text);
    assert.ok(m, r.text);
    assert.equal(m[1], pairingCode());
  });

  test('without a proxy, and with spawning off, the server waits for one instead of taking the plugin port', async () => {
    const wsPort = await freePort();
    const proxyPort = await freePort();
    const mcp = await startMcp({ env: mcpEnv({ wsPort, proxyPort }) });
    later(() => mcp.close());
    await sleep(800);
    assert.equal(await portOpen(wsPort), false, 'no direct-mode server on the plugin port');
    assert.match((await mcp.call('monorail_status')).text, /Not connected to the monorail proxy/);
    const proxy = await startProxy({ wsPort, proxyPort });
    later(() => proxy.stop());
    const plugin = startFakePlugin({ port: wsPort });
    later(() => plugin.close());
    await plugin.ready;
    const r = await mcp.call('monorail_css', { node_id: 'n' });
    assert.equal(r.isError, false, r.text);
  });
});
