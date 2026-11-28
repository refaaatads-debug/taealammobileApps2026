import test from 'node:test';
import assert from 'node:assert/strict';
import { isOutgoingRingingCallForUser } from '../internalCallDirection.ts';

test('identifies a ringing call created by the signed-in user as outgoing', () => {
  assert.equal(
    isOutgoingRingingCallForUser(
      { status: 'ringing', callerId: 'teacher-1' },
      'teacher-1',
    ),
    true,
  );
});

test('does not treat a call from another user as outgoing', () => {
  assert.equal(
    isOutgoingRingingCallForUser(
      { status: 'ringing', callerId: 'teacher-1' },
      'student-1',
    ),
    false,
  );
});

test('does not treat active calls or signed-out state as outgoing ringing', () => {
  assert.equal(
    isOutgoingRingingCallForUser(
      { status: 'active', callerId: 'teacher-1' },
      'teacher-1',
    ),
    false,
  );
  assert.equal(
    isOutgoingRingingCallForUser(
      { status: 'ringing', callerId: 'teacher-1' },
      null,
    ),
    false,
  );
});