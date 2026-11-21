import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePendingTeacherSubmissions } from '../teacherAssignmentTasks.ts';

test('counts submitted and AI-graded homework and quizzes as teacher review tasks', () => {
  const summary = summarizePendingTeacherSubmissions([
    { assignment_id: 'homework', status: 'submitted' },
    { assignment_id: 'quiz', status: 'ai_graded' },
    { assignment_id: 'reviewed', status: 'reviewed' },
    { assignment_id: 'unknown', status: 'cancelled' },
  ], new Map([
    ['homework', 'واجب'],
    ['quiz', 'اختبار'],
  ]));

  assert.deepEqual(summary, { total: 2, assignments: 1, quizzes: 1 });
});

test('does not count missing or unknown statuses as pending', () => {
  assert.deepEqual(summarizePendingTeacherSubmissions([
    { assignment_id: 'a' },
    { assignment_id: 'b', status: ' ' },
    { assignment_id: 'c', status: 'reviewed' },
  ], new Map()), { total: 0, assignments: 0, quizzes: 0 });
});
