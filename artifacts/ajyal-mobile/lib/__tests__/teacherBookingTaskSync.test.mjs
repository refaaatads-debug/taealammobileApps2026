import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTeacherInPersonRequestCountQueryKey,
  getTeacherInPersonDecisionOutcome,
  refreshTeacherBookingTaskCounts,
} from '../teacherBookingTaskSync.ts';

test('refreshing teacher booking tasks invalidates online and in-person home counts', async () => {
  const invalidated = [];
  await refreshTeacherBookingTaskCounts({
    invalidateQueries: async ({ queryKey }) => invalidated.push(queryKey),
  }, 'teacher-1', ['/api/booking-requests', { view: 'incoming' }]);

  assert.deepEqual(invalidated, [
    ['/api/booking-requests', { view: 'incoming' }],
    ['teacher-in-person-request-count', 'teacher-1'],
  ]);
});

test('the in-person task count is scoped to the authenticated teacher', () => {
  assert.deepEqual(getTeacherInPersonRequestCountQueryKey('teacher-1'), [
    'teacher-in-person-request-count',
    'teacher-1',
  ]);
});

test('a false in-person decision response is a conflict, not a success', () => {
  assert.equal(getTeacherInPersonDecisionOutcome(false, null), 'conflict');
});

test('only a confirmed true in-person response is a success', () => {
  assert.equal(getTeacherInPersonDecisionOutcome(true, null), 'success');
  assert.equal(getTeacherInPersonDecisionOutcome(null, new Error('network error')), 'error');
});
