/**
 * The plugin's request loop (figma-plugin/code.js), run in a VM against a
 * minimal fake `figma`. No Figma, and no Figma writes: only read handlers and
 * handlers that fail before touching the document are exercised.
 *
 * What it pins: every request gets exactly one reply, and the reply echoes
 * the request's id. A request that got no reply held the proxy's lock for
 * every session (docs/proxy-wedge-2026-09.md). Requests run one at a time, so
 * two handlers never interleave at their awaits, and a withdrawn request that
 * hasn't started never does.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { REPO } from './harness.js';

const CODE = fs.readFileSync(path.join(REPO, 'figma-plugin', 'code.js'), 'utf8');

function loadPlugin({ nodes = {}, storage = {}, storageThrows = false, loadFontAsync } = {}) {
  const posted = [];
  const ui = { postMessage: (m) => posted.push(m), onmessage: null };
  const page = { name: 'Page 1', selection: [], children: [], findAll: () => [] };
  const figma = {
    editorType: 'figma',
    apiVersion: '1.0.0',
    fileKey: null,
    mixed: Symbol('mixed'),
    root: { name: 'Fake file', children: [page] },
    currentPage: page,
    ui,
    showUI() {},
    on() {},
    notify() {},
    closePlugin() {},
    getNodeByIdAsync: async (id) => nodes[id] ?? null,
    loadFontAsync: loadFontAsync ?? (async () => {}),
    clientStorage: {
      getAsync: async (k) => { if (storageThrows) throw new Error('storage unavailable'); return storage[k]; },
      setAsync: async (k, v) => { storage[k] = v; },
      deleteAsync: async (k) => { delete storage[k]; },
    },
  };
  // Unref'd, so a queue timer (a write's is two minutes) doesn't keep the test process alive.
  const unrefTimeout = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); t.unref?.(); return t; };
  const context = vm.createContext({ figma, __html__: '', console: { log() {}, error() {}, warn() {} }, setTimeout: unrefTimeout, clearTimeout });
  vm.runInContext(CODE, context);
  assert.equal(typeof ui.onmessage, 'function', 'code.js should install figma.ui.onmessage');
  // Replies only: what code.ts posts at startup (file context, the stored pairing code) isn't one.
  const replies = () => posted.filter((m) => m.type !== 'pairing-code' && m.type !== 'file-context');
  return {
    figma, posted, storage, replies,
    async send(msg) {
      const before = replies().length;
      await ui.onmessage(msg);
      return replies().slice(before);
    },
    /** Deliver without waiting, the way several messages arrive from the UI. */
    post(msg) { return ui.onmessage(msg); },
  };
}

describe('plugin request loop', () => {
  test('a reply echoes the request id', async () => {
    const node = { id: '1:2', name: 'Box', type: 'FRAME', width: 10, height: 20, getCSSAsync: async () => ({ width: '10px' }), fills: [], strokes: [], effects: [] };
    const p = loadPlugin({ nodes: { '1:2': node } });
    const out = await p.send({ type: 'get-css', nodeId: '1:2', requestId: 'px-7' });
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'css-extracted');
    assert.equal(out[0].success, true);
    assert.equal(out[0].requestId, 'px-7');
  });

  test('a request without an id gets a reply without one (protocol 1 senders)', async () => {
    const p = loadPlugin();
    const out = await p.send({ type: 'get-css', nodeId: 'nope' });
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'css-extracted');
    assert.equal(out[0].success, false);
    assert.equal('requestId' in out[0], false);
  });

  test('a handler that throws still replies, with the error and the id', async () => {
    const p = loadPlugin({ storageThrows: true });
    const out = await p.send({ type: 'export-ir', requestId: 'px-1' });
    assert.equal(out.length, 1, 'exactly one reply');
    assert.equal(out[0].type, 'exported');
    assert.equal(out[0].success, false);
    // (The fake throws from outside the VM's realm, so the message may carry an "Error: " prefix.)
    assert.match(out[0].error, /Plugin error in export-ir: (Error: )?storage unavailable/);
    assert.equal(out[0].requestId, 'px-1');
  });

  test('a handler that returns early without replying gets a reply anyway', async () => {
    const p = loadPlugin();
    const out = await p.send({ type: 'apply-ir', requestId: 'px-2' }); // no IR: returned after a notify
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'applied');
    assert.equal(out[0].success, false);
    assert.match(out[0].error, /without a result/);
    assert.equal(out[0].requestId, 'px-2');
  });

  test('an error reply the handler posts itself is not doubled', async () => {
    const p = loadPlugin();
    const out = await p.send({ type: 'capture-template', slideId: '9:9', requestId: 'px-3' });
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'template-captured');
    assert.match(out[0].error, /Slide not found: 9:9/);
    assert.equal(out[0].requestId, 'px-3');
  });

  test('a probe that cuts a list says so, and echoes the id', async () => {
    const p = loadPlugin();
    const out = await p.send({ type: 'apply-probe', action: 'eval', code: 'return Array.from({ length: 56 }, (_, i) => i);', requestId: 'px-9' });
    assert.equal(out.length, 1);
    const r = out[0];
    assert.equal(r.type, 'probe-result');
    assert.equal(r.requestId, 'px-9');
    assert.equal(r.result.length, 51);
    assert.match(r.result[50], /6 more items, 56 in all/);
    assert.equal(r.truncated, true);
    assert.equal(r.truncation.examples.join('|'), '$.result: 56 items, kept 50'); // (a VM-realm array)
  });

  test('a probe with max_items raised returns everything', async () => {
    const p = loadPlugin();
    const [r] = await p.send({ type: 'apply-probe', action: 'eval', code: 'return Array.from({ length: 56 }, (_, i) => i);', maxItems: 100 });
    assert.equal(r.result.length, 56);
    assert.equal(r.truncated, false);
  });

  test('messages that are not requests get no synthetic reply', async () => {
    const p = loadPlugin();
    const out = await p.send({ type: 'get-slide-reference' });
    assert.ok(out.every((m) => m.type === 'slide-reference'));
  });
});

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function cssNode(id, getCSSAsync) {
  return { id, name: id, type: 'FRAME', width: 1, height: 1, getCSSAsync, fills: [], strokes: [], effects: [] };
}

describe('plugin request queue', () => {
  test('requests run one at a time, in arrival order', async () => {
    const events = [];
    let releaseA;
    const nodes = {
      A: cssNode('A', () => { events.push('A start'); return new Promise((r) => { releaseA = () => { events.push('A end'); r({}); }; }); }),
      B: cssNode('B', async () => { events.push('B start'); return {}; }),
    };
    const p = loadPlugin({ nodes });
    const a = p.post({ type: 'get-css', nodeId: 'A', requestId: 'px-1' });
    const b = p.post({ type: 'get-css', nodeId: 'B', requestId: 'px-2' });
    await tick(20);
    assert.deepEqual(events, ['A start'], 'B waits while A is between awaits');
    releaseA();
    await Promise.all([a, b]);
    assert.deepEqual(events, ['A start', 'A end', 'B start']);
    assert.deepEqual(p.replies().map((m) => m.requestId), ['px-1', 'px-2']);
  });

  test('a request withdrawn before it starts never runs, and says so', async () => {
    let calledB = false;
    let releaseA;
    const nodes = {
      A: cssNode('A', () => new Promise((r) => { releaseA = () => r({}); })),
      B: cssNode('B', async () => { calledB = true; return {}; }),
    };
    const p = loadPlugin({ nodes });
    const a = p.post({ type: 'get-css', nodeId: 'A', requestId: 'px-1' });
    const b = p.post({ type: 'get-css', nodeId: 'B', requestId: 'px-2' });
    p.post({ type: 'cancel', requestId: 'px-2' });
    await tick(10);
    releaseA();
    await Promise.all([a, b]);
    assert.equal(calledB, false);
    const rb = p.replies().find((m) => m.requestId === 'px-2');
    assert.equal(rb.success, false);
    assert.match(rb.error, /cancelled before it started/);
  });

  test('a read that hangs past its time lets the next request run', async () => {
    let calledB = false;
    const nodes = {
      A: cssNode('A', () => new Promise(() => {})),
      B: cssNode('B', async () => { calledB = true; return {}; }),
    };
    const p = loadPlugin({ nodes });
    p.post({ type: 'get-css', nodeId: 'A', requestId: 'px-1', timeoutMs: 100 });
    const b = p.post({ type: 'get-css', nodeId: 'B', requestId: 'px-2', timeoutMs: 5000 });
    await b;
    assert.equal(calledB, true, 'the queue moved on after 100ms + 1s');
  });

  test('a write that runs past its time still keeps the next request out', async () => {
    let calledB = false;
    const nodes = { B: cssNode('B', async () => { calledB = true; return {}; }) };
    // apply-ir waits for fonts before it touches the document; a font that never loads keeps it there.
    const p = loadPlugin({ nodes, loadFontAsync: () => new Promise(() => {}) });
    p.post({ type: 'apply-ir', ir: JSON.stringify({ deck: { title: 't' }, slides: [] }), requestId: 'px-1', timeoutMs: 100 });
    p.post({ type: 'get-css', nodeId: 'B', requestId: 'px-2', timeoutMs: 5000 });
    await tick(1500);
    assert.equal(calledB, false, 'a read would have moved on by now; a write holds for WRITE_HOLD_MS');
  });

  test('messages that are not requests are not queued behind one', async () => {
    const p = loadPlugin({ nodes: { A: cssNode('A', () => new Promise(() => {})) } });
    p.post({ type: 'get-css', nodeId: 'A', requestId: 'px-1', timeoutMs: 60000 });
    await p.post({ type: 'get-slide-reference' });
    assert.ok(p.posted.some((m) => m.type === 'slide-reference'), 'answered while get-css hangs');
  });
});
