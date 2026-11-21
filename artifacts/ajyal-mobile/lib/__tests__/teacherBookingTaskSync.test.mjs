import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTeacherInPersonRequestCountQueryKey,
  getTeacherInPersonDecisionOutcome,
  countOpenBookingRequestGroups,
  isTeacherBookingNotification,
  refetchTeacherBookingTaskQueries,
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

test('an online request group with several appointment rows counts as one decision', () => {
  const requests = [
    { id: 'slot-1', groupId: 'group-a', status: 'open' },
    { id: 'slot-2', groupId: 'group-a', status: 'open' },
    { id: 'slot-3', groupId: 'group-a', status: 'open' },
  ];

  assert.equal(countOpenBookingRequestGroups(requests), 1);
});

test('only distinct open groups count, with standalone requests counted by id', () => {
  const requests = [
    { id: 'slot-1', groupId: 'group-a', status: 'open' },
    { id: 'slot-2', groupId: 'group-a', status: 'open' },
    { id: 'slot-3', groupId: 'group-b', status: 'accepted' },
    { id: 'slot-4', status: 'open' },
    { id: 'slot-5', status: 'open' },
  ];

  assert.equal(countOpenBookingRequestGroups(requests), 3);
});

test('booking realtime refreshes both online and in-person task counts', async () => {
  const refreshed = [];
  const refetch = (name) => async () => {
    refreshed.push(name);
  };

  await refetchTeacherBookingTaskQueries(
    refetch('online'),
    refetch('in-person'),
    refetch('dashboard'),
  );

  assert.deepEqual(refreshed.sort(), ['dashboard', 'in-person', 'online']);
});

test('booking notifications trigger a realtime task refresh but unrelated ones do not', () => {
  assert.equal(isTeacherBookingNotification('booking_request'), true);
  assert.equal(isTeacherBookingNotification('booking_cancelled'), true);
  assert.equal(isTeacherBookingNotification('in_person_request'), true);
  assert.equal(isTeacherBookingNotification('assignment_created'), false);
  assert.equal(isTeacherBookingNotification(null), false);
});
