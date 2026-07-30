/**
 * Tests for the pure geometry behind `monorail_primitives`.
 *
 * Node's built-in runner, no dependencies:  npm test
 *
 * Run against the compiled output in dist/, so this exercises the same code the
 * plugin bundles. Each block names the bug it exists to prevent — every one of
 * them shipped, and every one failed silently, drawing something plausible
 * instead of erroring. See docs/failures.md, 2026-07-30.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalisePath,
  resolveDash,
  resolveDirectionDegrees,
  autoLayoutSizing,
  crossAxisSizingProp,
  mainAxisSizingProp,
} from '../dist/shared/geometry.js';

describe('normalisePath', () => {
  // THE path bug: points in slide coordinates produced a vector whose geometry
  // sat far from an origin pinned at (0,0), so every connector landed in the
  // slide's top-left corner. This is the assertion that would have caught it.
  test('places the node at the hull minimum so slide coordinates land where they say', () => {
    const { vertices, x, y } = normalisePath([
      { x: 996, y: 328 },
      { x: 1030, y: 328 },
      { x: 1030, y: 404 },
      { x: 1080, y: 404 },
    ]);

    assert.equal(x, 996, 'node x should be the leftmost point');
    assert.equal(y, 328, 'node y should be the topmost point');
    assert.deepEqual(vertices[0], { x: 0, y: 0 }, 'hull top-left becomes the local origin');
    assert.equal(Math.min(...vertices.map((v) => v.x)), 0);
    assert.equal(Math.min(...vertices.map((v) => v.y)), 0);

    // The invariant that matters: local vertex + node origin === the caller's point.
    const original = [
      { x: 996, y: 328 },
      { x: 1030, y: 328 },
      { x: 1030, y: 404 },
      { x: 1080, y: 404 },
    ];
    vertices.forEach((v, i) => {
      assert.equal(v.x + x, original[i].x);
      assert.equal(v.y + y, original[i].y);
    });
  });

  // Relative points with an explicit x/y are how this was used before the fix.
  // Their hull minimum is 0, so the offset is the caller's x/y and nothing moves.
  test('leaves relative points with an explicit offset unchanged', () => {
    const { vertices, x, y } = normalisePath([{ x: 0, y: 0 }, { x: 150, y: 80 }], 100, 200);
    assert.equal(x, 100);
    assert.equal(y, 200);
    assert.deepEqual(vertices, [{ x: 0, y: 0 }, { x: 150, y: 80 }]);
  });

  test('an offset is added on top of absolute points', () => {
    const { x, y } = normalisePath([{ x: 10, y: 20 }, { x: 30, y: 40 }], 5, 7);
    assert.equal(x, 15);
    assert.equal(y, 27);
  });

  // A vertical connector: every point shares an x, so the hull is zero-width.
  test('handles a single-axis path', () => {
    const { vertices, x, y } = normalisePath([{ x: 400, y: 100 }, { x: 400, y: 300 }]);
    assert.equal(x, 400);
    assert.equal(y, 100);
    assert.deepEqual(vertices, [{ x: 0, y: 0 }, { x: 0, y: 200 }]);
    assert.equal(Math.max(...vertices.map((v) => v.x)), 0, 'zero-width hull');
  });

  test('handles negative coordinates', () => {
    const { vertices, x, y } = normalisePath([{ x: -50, y: -20 }, { x: 50, y: 20 }]);
    assert.equal(x, -50);
    assert.equal(y, -20);
    assert.deepEqual(vertices, [{ x: 0, y: 0 }, { x: 100, y: 40 }]);
  });

  test('rejects a path that cannot be drawn', () => {
    assert.throws(() => normalisePath([{ x: 0, y: 0 }]), /at least 2 points/);
    assert.throws(() => normalisePath([]), /at least 2 points/);
  });

  test('does not mutate the caller’s points', () => {
    const points = [{ x: 5, y: 5 }, { x: 15, y: 25 }];
    normalisePath(points);
    assert.deepEqual(points, [{ x: 5, y: 5 }, { x: 15, y: 25 }]);
  });
});

describe('resolveDirectionDegrees', () => {
  // Silently meaning 'right' is the bug: `direction: 'VERTICAL'` is valid on an
  // auto_layout_frame and meaningless on a line, so it gets copy-pasted.
  test('warns instead of guessing on an unrecognised token', () => {
    const result = resolveDirectionDegrees('VERTICAL');
    assert.equal(result.degrees, 0);
    assert.match(result.warning, /Unrecognised direction "VERTICAL"/);
  });

  test('maps the four tokens to screen degrees, positive clockwise', () => {
    assert.equal(resolveDirectionDegrees('right').degrees, 0);
    assert.equal(resolveDirectionDegrees('down').degrees, 90);
    assert.equal(resolveDirectionDegrees('left').degrees, 180);
    assert.equal(resolveDirectionDegrees('up').degrees, -90);
  });

  test('passes numeric degrees through, and defaults to right', () => {
    assert.equal(resolveDirectionDegrees(45).degrees, 45);
    assert.equal(resolveDirectionDegrees(-90).degrees, -90);
    assert.equal(resolveDirectionDegrees(undefined).degrees, 0);
  });

  test('recognised values carry no warning', () => {
    for (const dir of ['up', 'down', 'left', 'right', undefined, 30]) {
      assert.equal(resolveDirectionDegrees(dir).warning, undefined, `${dir} should not warn`);
    }
  });

  // `direction: 'down'` and `rotation: 90` must agree — they disagreed on `line`,
  // where one branch negated and the other didn't.
  test("'down' is the same 90 degrees a caller passes as rotation", () => {
    assert.equal(resolveDirectionDegrees('down').degrees, resolveDirectionDegrees(90).degrees);
  });
});

describe('resolveDash', () => {
  test('a number becomes an even pattern', () => {
    assert.deepEqual(resolveDash(6), [6, 6]);
  });

  test('an array passes through', () => {
    assert.deepEqual(resolveDash([8, 4]), [8, 4]);
  });

  test('undefined means no dash, not a zero-length one', () => {
    assert.equal(resolveDash(undefined), undefined);
  });

  // 0 is falsy but a legitimate request for a degenerate pattern; it must not be
  // confused with "no dash specified".
  test('zero is distinguishable from unset', () => {
    assert.deepEqual(resolveDash(0), [0, 0]);
  });
});

describe('autoLayoutSizing', () => {
  // Hardcoded hug on both axes is what made lists ragged; the axis mapping is
  // what makes a fix either work or collapse the frame to nothing.
  test('VERTICAL: width fixes the cross axis, height hugs', () => {
    assert.deepEqual(autoLayoutSizing('VERTICAL', 344, undefined), {
      counterAxisSizingMode: 'FIXED',
      primaryAxisSizingMode: 'AUTO',
    });
  });

  test('HORIZONTAL: width fixes the MAIN axis', () => {
    assert.deepEqual(autoLayoutSizing('HORIZONTAL', 344, undefined), {
      counterAxisSizingMode: 'AUTO',
      primaryAxisSizingMode: 'FIXED',
    });
  });

  test('HORIZONTAL: height fixes the cross axis', () => {
    assert.deepEqual(autoLayoutSizing('HORIZONTAL', undefined, 80), {
      counterAxisSizingMode: 'FIXED',
      primaryAxisSizingMode: 'AUTO',
    });
  });

  test('both dimensions fix both axes', () => {
    assert.deepEqual(autoLayoutSizing('VERTICAL', 344, 288), {
      counterAxisSizingMode: 'FIXED',
      primaryAxisSizingMode: 'FIXED',
    });
  });

  test('neither dimension hugs both axes, preserving the old default', () => {
    assert.deepEqual(autoLayoutSizing('VERTICAL', undefined, undefined), {
      counterAxisSizingMode: 'AUTO',
      primaryAxisSizingMode: 'AUTO',
    });
  });
});

describe('layoutSizing property selection', () => {
  test('a child of a VERTICAL parent fills horizontally', () => {
    assert.equal(crossAxisSizingProp(true), 'layoutSizingHorizontal');
    assert.equal(mainAxisSizingProp(true), 'layoutSizingVertical');
  });

  test('a child of a HORIZONTAL parent fills vertically', () => {
    assert.equal(crossAxisSizingProp(false), 'layoutSizingVertical');
    assert.equal(mainAxisSizingProp(false), 'layoutSizingHorizontal');
  });

  test('cross and main are never the same axis', () => {
    for (const vertical of [true, false]) {
      assert.notEqual(crossAxisSizingProp(vertical), mainAxisSizingProp(vertical));
    }
  });
});
