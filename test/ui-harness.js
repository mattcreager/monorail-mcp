/**
 * Run the plugin UI's script (figma-plugin/ui.html) in a VM with stub DOM
 * elements and Node's `ws` as the browser WebSocket, so its socket logic can
 * be driven against a real proxy without Figma.
 *
 * `html` defaults to the current ui.html; pass another build's HTML (e.g.
 * `git show 4f70a20:figma-plugin/ui.html`) to compare behaviour.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import WebSocket from 'ws';
import { REPO } from './harness.js';

export const CURRENT_UI = fs.readFileSync(path.join(REPO, 'figma-plugin', 'ui.html'), 'utf8');

function stubElement(id) {
  return {
    id, className: '', innerHTML: '', textContent: '', disabled: false, scrollTop: 0, style: {},
    value: id === 'ws-url-input' ? 'ws://localhost:9876' : '',
    checked: id === 'auto-connect',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, contains: () => false, select() {},
  };
}

/** Load the UI script and point it at ws://localhost:<wsPort>; returns handles to drive it like Figma would. */
export function loadUi(wsPort, { html = CURRENT_UI } = {}) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = {};
  const toPlugin = [];
  const timers = new Set();
  const track = (fn) => (cb, ms, ...a) => { const t = fn(cb, ms, ...a); timers.add(t); return t; };
  const context = vm.createContext({
    WebSocket,
    JSON, console: { log() {}, error() {}, warn() {} },
    setTimeout: track(setTimeout), clearTimeout,
    setInterval: track(setInterval), clearInterval,
    parent: { postMessage: (m) => toPlugin.push(m.pluginMessage) },
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      getElementById: (id) => (elements[id] ??= stubElement(id)),
      addEventListener() {},
      createElement: () => stubElement('tmp'),
      execCommand: () => true,
      body: { appendChild() {}, removeChild() {} },
    },
  });
  context.window = context;
  vm.runInContext(script, context);
  // Point it at the test proxy before the 500ms auto-connect fires.
  elements['ws-url-input'].value = `ws://localhost:${wsPort}`;
  elements['ws-url-input'].onchange();
  return {
    elements, toPlugin,
    status: () => elements['status-label'].innerHTML,
    /** What code.ts would post back to the UI. */
    fromPlugin: (m) => context.window.onmessage({ data: { pluginMessage: m } }),
    click: (id) => elements[id].onclick({ stopPropagation() {} }),
    stop() {
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
      elements['auto-connect'].checked = false;
      elements['disconnect-btn'].onclick();
    },
  };
}
