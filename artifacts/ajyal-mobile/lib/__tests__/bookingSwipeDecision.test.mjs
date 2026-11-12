import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingSwipeDecision } from '../bookingSwipeDecision.ts';

test('a clear right swipe accepts the booking', () => {
  assert.equal(bookingSwipeDecision(84, 0, 72), 'accepted');
});

test('a clear left swipe rejects the booking', () => {
  assert.equal(bookingSwipeDecision(-84, 0, 72), 'rejected');
});

test('a fast intentional flick commits before reaching the distance threshold', () => {
  assert.equal(bookingSwipeDecision(14, 760, 72), 'accepted');
  assert.equal(bookingSwipeDecision(-14, -760, 72), 'rejected');
});

test('a short slow drag does not decide the booking', () => {
  assert.equal(bookingSwipeDecision(28, 120, 72), null);
  assert.equal(bookingSwipeDecision(-28, -120, 72), null);
});

test('a swipe in opposite directions uses the final drag direction', () => {
  assert.equal(bookingSwipeDecision(80, -900, 72), 'accepted');
});
