import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatTime} from './format-time.ts';

test('zero', () => {
  assert.equal(formatTime(0), '00:00:00.000');
});

test('under one second keeps leading zeros', () => {
  assert.equal(formatTime(1), '00:00:00.001');
  assert.equal(formatTime(42), '00:00:00.042');
  assert.equal(formatTime(999), '00:00:00.999');
});

test('carries into seconds, minutes and hours', () => {
  assert.equal(formatTime(1_000), '00:00:01.000');
  assert.equal(formatTime(59_999), '00:00:59.999');
  assert.equal(formatTime(60_000), '00:01:00.000');
  assert.equal(formatTime(3_600_000), '01:00:00.000');
  assert.equal(formatTime(3_661_001), '01:01:01.001');
});

test('hours beyond two digits are not truncated', () => {
  assert.equal(formatTime(100 * 3_600_000), '100:00:00.000');
});

test('fractions round up and carry', () => {
  assert.equal(formatTime(0.2), '00:00:00.001');
  assert.equal(formatTime(999.5), '00:00:01.000');
});

test('negative, NaN and Infinity show zero', () => {
  assert.equal(formatTime(-5), '00:00:00.000');
  assert.equal(formatTime(NaN), '00:00:00.000');
  assert.equal(formatTime(Infinity), '00:00:00.000');
});
