/**
 * monorail_probe's serialiser (shared/probe.ts): every cut is marked.
 *
 * On 2026-09-27 two tree dumps came back as exactly 50 rows of 56, with
 * nothing to say the rest were gone. These pin the marker, the report, and
 * the warning the server prints above the JSON.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createSafeJson, describeTruncation, MORE_KEYS } from '../dist/shared/probe.js';

const range = (n) => Array.from({ length: n }, (_, i) => i);

describe('createSafeJson', () => {
  test('a list over the cap ends with a marker saying how many are missing', () => {
    const s = createSafeJson();
    const out = s.safeJson(range(56), 2, '$.result');
    assert.equal(out.length, 51);
    assert.deepEqual(out.slice(0, 50), range(50));
    assert.match(out[50], /^\[… 6 more items, 56 in all/);
    const r = s.report();
    assert.equal(r.truncated, true);
    assert.equal(r.truncation.arrays, 1);
    assert.deepEqual(r.truncation.examples, ['$.result: 56 items, kept 50']);
  });

  test('an object over the cap gets a "…" key', () => {
    const s = createSafeJson({ maxKeys: 3 });
    const out = s.safeJson({ a: 1, b: 2, c: 3, d: 4, e: 5 }, 2);
    assert.deepEqual(Object.keys(out), ['a', 'b', 'c', MORE_KEYS]);
    assert.match(out[MORE_KEYS], /^2 more keys, 5 in all/);
    assert.equal(s.report().truncation.objects, 1);
  });

  test('nothing cut, nothing reported', () => {
    const s = createSafeJson();
    assert.deepEqual(s.safeJson({ rows: range(50) }, 3), { rows: range(50) });
    assert.deepEqual(s.report(), { truncated: false });
  });

  test('raising max_items keeps everything', () => {
    const s = createSafeJson({ maxItems: 500 });
    assert.equal(s.safeJson(range(300), 2).length, 300);
    assert.equal(s.report().truncated, false);
  });

  test('a depth cut is reported, but is not a silent truncation', () => {
    const s = createSafeJson();
    const out = s.safeJson({ a: { b: { c: [1, 2, 3] } } }, 2);
    assert.equal(out.a.b, '[object Object]');
    const r = s.report();
    assert.equal(r.truncated, false);
    assert.equal(r.truncation.depth, 1);
    assert.match(describeTruncation({ success: true, ...r }), /^Note: 1 value below depth 2/);
  });

  test('the report covers every value serialised in one probe', () => {
    const s = createSafeJson({ maxItems: 2 });
    s.safeJson([1, 2, 3], 2, '$.values.fills');
    s.safeJson([1, 2, 3, 4], 2, '$.values.strokes');
    const r = s.report();
    assert.equal(r.truncation.arrays, 2);
    assert.deepEqual(r.truncation.examples, ['$.values.fills: 3 items, kept 2', '$.values.strokes: 4 items, kept 2']);
  });

  test('capList marks a cut list of names', () => {
    const s = createSafeJson();
    const names = s.capList(range(205).map(String), 200, '$.namespaces.motion');
    assert.equal(names.length, 201);
    assert.match(names[200], /5 more, 205 in all/);
    assert.equal(s.report().truncated, true);
  });

  test('limits are clamped', () => {
    const s = createSafeJson({ maxItems: -4, maxKeys: 1e9 });
    const { limits } = (s.safeJson(range(3), 1), s.report()).truncation ?? { limits: null };
    // A cut happened at maxItems = 1 (clamped up from -4).
    assert.equal(limits.maxItems, 1);
    assert.equal(limits.maxKeys, 10000);
  });
});

describe('describeTruncation', () => {
  test('warns above the JSON when the plugin reports a cut', () => {
    const s = createSafeJson();
    const reply = { success: true, result: s.safeJson(range(56), 4, '$.result'), ...s.report() };
    assert.match(describeTruncation(reply), /^⚠ Truncated: 1 list cut at 50 items \(\$\.result: 56 items, kept 50\)/);
  });

  test('says nothing for a complete result', () => {
    const s = createSafeJson();
    const reply = { success: true, result: s.safeJson(range(10), 4), ...s.report() };
    assert.equal(describeTruncation(reply), null);
  });

  test('flags the old silent caps in a reply from an older plugin build', () => {
    const legacy = { success: true, action: 'eval', result: { texts: range(50) } };
    assert.match(describeTruncation(legacy), /^⚠ Possibly truncated: \$\.texts has exactly 50 items/);
    assert.equal(describeTruncation({ success: true, action: 'eval', result: { texts: range(49) } }), null);
  });
});
