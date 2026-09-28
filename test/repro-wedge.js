/**
 * Reproduce the 2026-09-27 proxy wedge against a build, using the fake plugin.
 *
 *   node test/repro-wedge.js                 # the current build (dist/, figma-plugin/ui.html)
 *   node test/repro-wedge.js --dist tmp/head/dist --ui-rev 4f70a20   # an older build
 *   node test/repro-wedge.js --quick         # skip the two 30-second scenarios
 *
 * --dist points at a built dist/ (e.g. a copy made before rebuilding);
 * --ui-rev loads figma-plugin/ui.html from a git revision for scenario E.
 *
 * Every scenario runs on its own ephemeral ports: it never touches the live
 * proxy on 9876/9877. Not part of `npm test` (it prints a timeline instead of
 * asserting); test/proxy.test.js and test/server.test.js pin the fixed behaviour.
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startFakePlugin } from './fake-plugin.js';
import { startProxy, connectUpstream, startMcp, sleep, REPO, DIST } from './harness.js';
import { loadUi, CURRENT_UI } from './ui-harness.js';

const args = process.argv.slice(2);
const distArg = args.includes('--dist') ? args[args.indexOf('--dist') + 1] : null;
const dist = distArg ? path.resolve(REPO, distArg) : DIST;
const quick = args.includes('--quick');
const uiRev = args.includes('--ui-rev') ? args[args.indexOf('--ui-rev') + 1] : null;
const uiHtml = uiRev
  ? execFileSync('git', ['show', `${uiRev}:figma-plugin/ui.html`], { cwd: REPO, encoding: 'utf8' })
  : CURRENT_UI;

const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`.padStart(8);
const say = (tag, line) => console.log(`${ts()} [${tag}] ${line}`);
const brief = (m) => {
  const { at, ...rest } = m;
  const s = JSON.stringify(rest);
  return s.length > 220 ? s.slice(0, 220) + '…' : s;
};

async function scenarioWedge() {
  const tag = 'A wedge';
  const proxy = await startProxy({ dist });
  const plugin = startFakePlugin({ port: proxy.wsPort, delayMs: 200 });
  await plugin.ready;
  const holder = await connectUpstream(proxy.proxyPort, { id: 'agent-1', label: 'agent-1' });
  const others = await Promise.all([2, 3, 4].map((n) => connectUpstream(proxy.proxyPort, { id: `agent-${n}`, label: `agent-${n}` })));

  say(tag, 'agent-1 sends get-css to a node whose handler never replies (timeoutMs 3000, which a new proxy honours)');
  holder.send({ type: 'get-css', nodeId: 'hang', requestId: 'a1', timeoutMs: 3000, clientLabel: 'agent-1' });
  await sleep(50);

  const tally = { busy: 0, ok: 0, silent: 0, other: 0 };
  let firstOkAt = null;
  const windowMs = 6000;
  for (let round = 0; Date.now() - t0 < windowMs + 1000 && round < 12; round++) {
    await Promise.all(others.map(async (u, i) => {
      const reqId = `r${round}-${i}`;
      const sent = Date.now();
      u.send({ type: 'get-css', nodeId: `n${i}`, requestId: reqId, timeoutMs: 3000, clientLabel: `agent-${i + 2}` });
      try {
        const m = await u.waitFor((x) => x.at >= sent && ['busy', 'css-extracted', 'error'].includes(x.type), 1000, { past: false });
        if (m.type === 'busy') { tally.busy++; if (round === 0 && i === 0) say(tag, `agent-2 got busy in ${m.at - sent}ms: ${brief(m)}`); }
        else if (m.type === 'css-extracted') { tally.ok++; firstOkAt ??= ts(); }
        else { tally.other++; say(tag, `agent-${i + 2}: ${brief(m)}`); }
      } catch { tally.silent++; }
    }));
    await sleep(500);
  }
  const status = await others[0].status();
  say(tag, `status-query: ${brief(status)}`);
  const expiry = holder.messages.find((m) => m.requestId === 'a1');
  say(tag, `agent-1 heard back: ${expiry ? brief(expiry) : 'nothing'}`);
  say(tag, `other agents over ~6s: ${tally.busy} busy, ${tally.ok} answered (first at ${firstOkAt ?? 'never'}), ${tally.silent} silent, ${tally.other} other`);
  plugin.close(); holder.close(); others.forEach((u) => u.close());
  await proxy.stop();
}

async function scenarioServerIgnoresBusy() {
  const tag = 'B busy→30s';
  const proxy = await startProxy({ dist });
  const plugin = startFakePlugin({ port: proxy.wsPort });
  await plugin.ready;
  const holder = await connectUpstream(proxy.proxyPort, { id: 'holder', label: 'holder' });
  holder.send({ type: 'get-css', nodeId: 'hang', clientLabel: 'holder' }); // legacy-shaped, no id, no timeout
  await sleep(100);
  const mcp = await startMcp({ dist, env: { MONORAIL_WS_PORT: String(proxy.wsPort), MONORAIL_PROXY_PORT: String(proxy.proxyPort), MONORAIL_PROXY_SPAWN: '0' }, label: 'session-B' });
  const sent = Date.now();
  say(tag, 'MCP server calls monorail_css while another session holds the plugin');
  const r = await mcp.call('monorail_css', { node_id: 'x' });
  say(tag, `monorail_css returned after ${((Date.now() - sent) / 1000).toFixed(1)}s: ${r.text.split('\n')[0]}`);
  await mcp.close(); plugin.close(); holder.close();
  await proxy.stop();
}

async function scenarioWrongPayload() {
  const tag = 'C late reply';
  const proxy = await startProxy({ dist });
  const plugin = startFakePlugin({ port: proxy.wsPort });
  await plugin.ready;
  const mcp = await startMcp({ dist, env: { MONORAIL_WS_PORT: String(proxy.wsPort), MONORAIL_PROXY_PORT: String(proxy.proxyPort), MONORAIL_PROXY_SPAWN: '0' }, label: 'session-C' });
  say(tag, 'call 1: monorail_css on node "slow:33000" (the plugin answers after 33s)');
  const first = mcp.call('monorail_css', { node_id: 'slow:33000' }).then((r) => { say(tag, `call 1 → ${r.text.split('\n')[0]}`); });
  await sleep(30500);
  say(tag, 'call 2: monorail_css on node "B"');
  const r2 = await mcp.call('monorail_css', { node_id: 'B' });
  say(tag, `call 2 → ${r2.text.split('\n')[0]}`);
  await first;
  await mcp.close(); plugin.close();
  await proxy.stop();
}

async function scenarioRestart() {
  const tag = 'D restart';
  const proxy = await startProxy({ dist });
  // Behave like the ui.html under test: the current one reconnects, pre-fix builds (--ui-rev) don't.
  const plugin = startFakePlugin({ port: proxy.wsPort, reconnect: !uiRev, reconnectMs: 300 });
  await plugin.ready;
  const env = { MONORAIL_WS_PORT: String(proxy.wsPort), MONORAIL_PROXY_PORT: String(proxy.proxyPort), MONORAIL_PROXY_LOG: path.join(REPO, 'tmp', 'repro-proxy.log'), MONORAIL_PROXY_SPAWN: '0' };
  const mcp = await startMcp({ dist, env, label: 'session-D' });
  const probe = await connectUpstream(proxy.proxyPort, { register: false });
  say(tag, `before restart: ${brief(await probe.status())}`);
  probe.close();
  const before = await mcp.call('monorail_css', { node_id: 'before' });
  say(tag, `monorail_css before restart → ${before.text.split('\n')[0]}`);

  await proxy.stop();
  say(tag, 'proxy killed; starting a new one on the same ports');
  const proxy2 = await startProxy({ dist, wsPort: proxy.wsPort, proxyPort: proxy.proxyPort });
  await sleep(4000);
  const probe2 = await connectUpstream(proxy2.proxyPort, { register: false });
  say(tag, `4s after restart: ${brief(await probe2.status())}`);
  probe2.close();
  const after = await mcp.call('monorail_css', { node_id: 'after' });
  say(tag, `monorail_css after restart → ${after.text.split('\n')[0]}`);
  await mcp.close(); plugin.close();
  await proxy2.stop();
}

async function scenarioUiRestart() {
  const tag = 'E plugin UI';
  const proxy = await startProxy({ dist });
  const ui = loadUi(proxy.wsPort, { html: uiHtml });
  const count = async (port) => {
    const u = await connectUpstream(port, { register: false });
    try { return (await u.status()).pluginCount; } finally { u.close(); }
  };
  for (let i = 0; i < 40 && (await count(proxy.proxyPort)) === 0; i++) await sleep(100);
  say(tag, `ui.html (${uiRev ?? 'working tree'}) connected: pluginCount=${await count(proxy.proxyPort)}`);
  await proxy.stop();
  say(tag, 'proxy killed; starting a new one on the same ports');
  const proxy2 = await startProxy({ dist, wsPort: proxy.wsPort, proxyPort: proxy.proxyPort });
  await sleep(5000);
  say(tag, `5s after restart: pluginCount=${await count(proxy2.proxyPort)}; the UI's status label says "${ui.status().replace(/<[^>]+>/g, '')}"`);
  ui.stop();
  await proxy2.stop();
}

console.log(`build: ${path.relative(REPO, dist) || '.'}, ui.html: ${uiRev ?? 'working tree'}${quick ? ' (quick)' : ''}`);
await scenarioWedge();
await scenarioRestart();
await scenarioUiRestart();
if (!quick) await Promise.all([scenarioServerIgnoresBusy(), scenarioWrongPayload()]);
process.exit(0);
