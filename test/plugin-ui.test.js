/**
 * The plugin UI's socket (figma-plugin/ui.html), run in a VM with stub DOM
 * elements and Node's `ws` as the browser WebSocket, against a real proxy.
 *
 * What it pins: after the proxy restarts, the UI reconnects by itself (no
 * re-run of the plugin), a deliberate Disconnect stays disconnected, and a
 * request id survives the round trip UI → code.ts → UI → proxy.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { startProxy, connectUpstream, waitUntil, sleep } from './harness.js';
import { loadUi } from './ui-harness.js';

async function pluginCount(proxyPort) {
  const probe = await connectUpstream(proxyPort, { register: false });
  try { return (await probe.status()).plugins; } finally { probe.close(); }
}

describe('plugin UI socket', () => {
  const cleanup = [];
  after(async () => { for (const fn of cleanup.reverse()) await fn(); });

  test('reconnects by itself after the proxy restarts', async () => {
    const proxy = await startProxy();
    let proxy2 = null;
    const ui = loadUi(proxy.wsPort);
    cleanup.push(async () => { ui.stop(); await proxy.stop(); await proxy2?.stop(); });

    const first = await waitUntil(async () => { const p = await pluginCount(proxy.proxyPort); return p.length === 1 && p[0].plugin && p; }, { what: 'the UI to connect and say hello' });
    assert.deepEqual(first[0].features, ['request-id', 'auto-reconnect']);
    assert.equal(first[0].version, '0.2.0');

    await proxy.stop();
    await waitUntil(() => /Reconnecting|Disconnected|Connection failed/.test(ui.status()), { what: 'the UI to notice' });
    await sleep(300); // let it fail at least once against the closed port
    proxy2 = await startProxy({ wsPort: proxy.wsPort, proxyPort: proxy.proxyPort });
    await waitUntil(async () => (await pluginCount(proxy2.proxyPort)).length === 1, { timeoutMs: 8000, what: 'the UI to reconnect' });
  });

  test('a request id survives the round trip through the UI', async () => {
    const proxy = await startProxy();
    const ui = loadUi(proxy.wsPort);
    cleanup.push(async () => { ui.stop(); await proxy.stop(); });
    await waitUntil(async () => (await pluginCount(proxy.proxyPort)).length === 1, { what: 'the UI to connect' });

    const up = await connectUpstream(proxy.proxyPort, { label: 'ui-test' });
    up.send({ type: 'get-css', nodeId: '1:2', requestId: 'mine-1', timeoutMs: 5000 });
    const req = await waitUntil(() => ui.toPlugin.find((m) => m.type === 'get-css'), { what: 'the UI to relay get-css' });
    assert.equal(req.nodeId, '1:2');
    assert.match(req.requestId, /^px-/, 'the plugin sees the proxy\'s id');

    ui.fromPlugin({ type: 'css-extracted', success: true, css: { width: '1px' }, raw: { name: 'n' }, requestId: req.requestId });
    const reply = await up.waitFor((m) => m.type === 'css-extracted');
    assert.equal(reply.requestId, 'mine-1', 'the sender gets its own id back');
    up.close();
  });

  test('a template-capture error reply is relayed instead of throwing', async () => {
    const proxy = await startProxy();
    const ui = loadUi(proxy.wsPort);
    cleanup.push(async () => { ui.stop(); await proxy.stop(); });
    await waitUntil(async () => (await pluginCount(proxy.proxyPort)).length === 1, { what: 'the UI to connect' });

    const up = await connectUpstream(proxy.proxyPort, { label: 'ui-test' });
    up.send({ type: 'capture-template', slideId: '9:9', requestId: 'cap-1', timeoutMs: 5000 });
    const req = await waitUntil(() => ui.toPlugin.find((m) => m.type === 'capture-template'), { what: 'the relay' });
    ui.fromPlugin({ type: 'template-captured', error: 'Slide not found: 9:9', requestId: req.requestId });
    const reply = await up.waitFor((m) => m.type === 'template-captured');
    assert.equal(reply.error, 'Slide not found: 9:9');
    assert.equal(reply.requestId, 'cap-1');
    up.close();
  });

  test('a deliberate Disconnect stays disconnected', async () => {
    const proxy = await startProxy();
    const ui = loadUi(proxy.wsPort);
    cleanup.push(async () => { ui.stop(); await proxy.stop(); });
    await waitUntil(async () => (await pluginCount(proxy.proxyPort)).length === 1, { what: 'the UI to connect' });

    ui.click('disconnect-btn');
    await waitUntil(async () => (await pluginCount(proxy.proxyPort)).length === 0, { what: 'the disconnect' });
    await sleep(1500); // longer than the first reconnect delays
    assert.equal((await pluginCount(proxy.proxyPort)).length, 0, 'no reconnect after a deliberate disconnect');
    assert.match(ui.status(), /Disconnected/);
  });
});
