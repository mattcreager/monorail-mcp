/** Tests for shared/typography.ts — CSS-ish text values → Figma units. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseWeight, styleCandidates, resolveLineHeight, resolveLetterSpacing } from '../dist/shared/typography.js';

describe('normaliseWeight', () => {
  test('numbers round to the nearest hundred; names map', () => {
    assert.equal(normaliseWeight(650), 600);
    assert.equal(normaliseWeight(450), 400);
    assert.equal(normaliseWeight('semibold'), 600);
    assert.equal(normaliseWeight('Semi-Bold'), 600);
    assert.equal(normaliseWeight('700'), 700);
  });
  test('absent weight falls back to the bold flag', () => {
    assert.equal(normaliseWeight(undefined, true), 700);
    assert.equal(normaliseWeight(undefined, false), undefined);
  });
  test('rejects nonsense', () => {
    assert.throws(() => normaliseWeight('chunky'), /Unknown font weight/);
    assert.throws(() => normaliseWeight(0), /out of range/);
  });
});

describe('styleCandidates', () => {
  test('exact style first, then heavier neighbour for emphasis weights', () => {
    const c = styleCandidates(600);
    assert.equal(c[0], 'SemiBold');
    assert.ok(c.indexOf('Bold') < c.indexOf('Medium'));
    assert.ok(c.includes('Semibold'), 'alias spelling included');
  });
  test('lighter neighbour first below 500', () => {
    const c = styleCandidates(300);
    assert.equal(c[0], 'Light');
    assert.ok(c.indexOf('ExtraLight') < c.indexOf('Regular'));
  });
});

describe('resolveLineHeight', () => {
  test('multiplier → percent, pixels stay pixels, strings parse', () => {
    assert.deepEqual(resolveLineHeight(1.04), { value: 104, unit: 'PERCENT' });
    assert.deepEqual(resolveLineHeight(52), { value: 52, unit: 'PIXELS' });
    assert.deepEqual(resolveLineHeight('120%'), { value: 120, unit: 'PERCENT' });
    assert.deepEqual(resolveLineHeight('40px'), { value: 40, unit: 'PIXELS' });
    assert.equal(resolveLineHeight(undefined), undefined);
    assert.equal(resolveLineHeight('auto'), undefined);
  });
  test('rejects zero and garbage', () => {
    assert.throws(() => resolveLineHeight(0), /Bad lineHeight/);
    assert.throws(() => resolveLineHeight('tall'), /Bad lineHeight/);
  });
});

describe('resolveLetterSpacing', () => {
  test('em and % → percent, numbers and px → pixels', () => {
    assert.deepEqual(resolveLetterSpacing('-0.035em'), { value: -3.5, unit: 'PERCENT' });
    assert.deepEqual(resolveLetterSpacing('.11em'), { value: 11, unit: 'PERCENT' });
    assert.deepEqual(resolveLetterSpacing('2%'), { value: 2, unit: 'PERCENT' });
    assert.deepEqual(resolveLetterSpacing(-0.96), { value: -0.96, unit: 'PIXELS' });
    assert.deepEqual(resolveLetterSpacing('1px'), { value: 1, unit: 'PIXELS' });
    assert.equal(resolveLetterSpacing('normal'), undefined);
  });
});
