/**
 * Tests for the pure logic behind native reveals (shared/motion.ts).
 * Runs against dist/, like geometry.test.js:  npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseReveal,
  pickAnimationStyle,
  revealEndsAt,
  stepFromReveal,
  normaliseTransition,
  DEFAULT_STEP_SECONDS,
  DEFAULT_REVEAL_DURATION,
} from '../dist/shared/motion.js';

describe('normaliseReveal', () => {
  test('a bare number is a step, placed at step × stepSeconds', () => {
    const r = normaliseReveal(2);
    assert.equal(r.step, 2);
    assert.equal(r.offset, 2 * DEFAULT_STEP_SECONDS);
    assert.equal(r.duration, DEFAULT_REVEAL_DURATION);
  });

  test('step defaults to 1 when only a style is given', () => {
    const r = normaliseReveal({ style: 'fade in' }, 2);
    assert.equal(r.step, 1);
    assert.equal(r.offset, 2);
    assert.equal(r.style, 'fade in');
  });

  test('explicit offset wins over step and clears it', () => {
    const r = normaliseReveal({ step: 3, offset: 0.25 });
    assert.equal(r.offset, 0.25);
    assert.equal(r.step, undefined);
  });

  test('step 0 animates in at the top of the timeline', () => {
    assert.equal(normaliseReveal(0).offset, 0);
  });

  test('nothing to reveal returns undefined', () => {
    assert.equal(normaliseReveal(undefined), undefined);
    assert.equal(normaliseReveal(null), undefined);
  });

  test('rejects nonsense rather than drawing something plausible', () => {
    assert.throws(() => normaliseReveal(-1), /non-negative integer/);
    assert.throws(() => normaliseReveal(1.5), /non-negative integer/);
    assert.throws(() => normaliseReveal({ duration: 0 }), /duration/);
    assert.throws(() => normaliseReveal({ offset: -2 }), /offset/);
    assert.throws(() => normaliseReveal(1, 0), /step_seconds/);
  });

  test('until marks the last visible step and must not precede the arrival', () => {
    assert.equal(normaliseReveal({ step: 1, until: 1 }).until, 1);
    assert.equal(normaliseReveal({ step: 0, until: 0 }).until, 0);
    assert.equal(normaliseReveal(2).until, undefined);
    assert.throws(() => normaliseReveal({ step: 2, until: 1 }), /before the step/);
    assert.throws(() => normaliseReveal({ until: -1 }), /until/);
  });

  test('props pass through untouched', () => {
    const props = { direction: 'right', distance: 120 };
    assert.deepEqual(normaliseReveal({ props }).props, props);
  });
});

describe('pickAnimationStyle', () => {
  const styles = [
    { styleId: 'S:1', name: 'Slide in' },
    { styleId: 'S:2', name: 'Fade in' },
    { styleId: 'S:3', name: 'Pop' },
  ];

  test('no request prefers an appear/fade-in style', () => {
    assert.equal(pickAnimationStyle(styles).styleId, 'S:2');
  });

  test('no request and no fade falls back to the first style', () => {
    assert.equal(pickAnimationStyle([styles[0], styles[2]]).styleId, 'S:1');
  });

  test('exact styleId, exact name, then partial name, case-insensitively', () => {
    assert.equal(pickAnimationStyle(styles, 'S:3').styleId, 'S:3');
    assert.equal(pickAnimationStyle(styles, 'fade in').styleId, 'S:2');
    assert.equal(pickAnimationStyle(styles, 'SLIDE').styleId, 'S:1');
    assert.equal(pickAnimationStyle(styles, 'a quick pop please').styleId, 'S:3');
  });

  test('unknown request yields undefined so the caller can fall back', () => {
    assert.equal(pickAnimationStyle(styles, 'explode'), undefined);
    assert.equal(pickAnimationStyle([], 'fade in'), undefined);
  });
});

describe('revealEndsAt', () => {
  test('is offset plus duration', () => {
    assert.equal(revealEndsAt({ offset: 3, duration: 0.5 }), 3.5);
  });
});

describe('stepFromReveal (Slides fallback: one slide per step)', () => {
  test('an explicit step is used as-is', () => {
    assert.equal(stepFromReveal({ step: 2, offset: 3, duration: 0.4 }), 2);
  });
  test('an offset rounds up into the step it falls in', () => {
    assert.equal(stepFromReveal({ offset: 0.2, duration: 0.4 }, 1.5), 1);
    assert.equal(stepFromReveal({ offset: 1.5, duration: 0.4 }, 1.5), 1);
    assert.equal(stepFromReveal({ offset: 1.6, duration: 0.4 }, 1.5), 2);
  });
  test('offset 0 is present from the start', () => {
    assert.equal(stepFromReveal({ offset: 0, duration: 0.4 }), 0);
  });
});

describe('normaliseTransition', () => {
  test('defaults to Smart Animate and accepts loose spelling', () => {
    assert.equal(normaliseTransition(), 'SMART_ANIMATE');
    assert.equal(normaliseTransition('smart animate'), 'SMART_ANIMATE');
    assert.equal(normaliseTransition('dissolve'), 'DISSOLVE');
  });
  test('rejects transitions that are not builds', () => {
    assert.throws(() => normaliseTransition('PUSH_FROM_LEFT'), /transition must be one of/);
  });
});
