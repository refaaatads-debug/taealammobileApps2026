import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dayIsAvailable,
  normalizeDays,
  parseClock,
  timeIsAvailable,
} from '../teacherAvailability.ts';

test('parses valid PostgreSQL TIME values without inventing a timezone', () => {
  assert.equal(parseClock('08:30'), 510);
  assert.equal(parseClock('8'), 480);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('not-a-time'), null);
});

test('normalizes stored weekday transport representations', () => {
  assert.deepEqual(normalizeDays(['saturday', 'sunday']), ['saturday', 'sunday']);
  assert.deepEqual(normalizeDays('{saturday,sunday}'), ['saturday', 'sunday']);
  assert.deepEqual(normalizeDays('["saturday","sunday"]'), ['saturday', 'sunday']);
});

test('matches a published weekday without applying a default day', () => {
  const saturday = new Date(2026, 8, 5, 12, 0, 0, 0);
  const monday = new Date(2026, 8, 7, 12, 0, 0, 0);
  assert.equal(dayIsAvailable(['saturday'], saturday), true);
  assert.equal(dayIsAvailable(['saturday'], monday), false);
  assert.equal(dayIsAvailable([], saturday), false);
});

test('treats the published end clock as an exclusive local window boundary', () => {
  assert.equal(timeIsAvailable('08:00', '08:00', '10:00'), true);
  assert.equal(timeIsAvailable('09:15', '08:00', '10:00'), true);
  assert.equal(timeIsAvailable('10:00', '08:00', '10:00'), false);
  assert.equal(timeIsAvailable('07:59', '08:00', '10:00'), false);
  assert.equal(timeIsAvailable('09:00', '10:00', '08:00'), false);
});