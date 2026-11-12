export type TeacherSubmissionSummary = {
  assignment_id?: string | null;
  status?: string | null;
};

export type TeacherAssignmentTaskSummary = {
  total: number;
  assignments: number;
  quizzes: number;
};

export function summarizePendingTeacherSubmissions(
  submissions: TeacherSubmissionSummary[],
  assignmentKinds: Map<string, string>,
): TeacherAssignmentTaskSummary {
  const pending = submissions.filter((submission) => {
    const status = submission.status?.trim().toLowerCase();
    return status === 'submitted' || status === 'ai_graded';
  });

  return pending.reduce<TeacherAssignmentTaskSummary>((summary, submission) => {
    summary.total += 1;
    const kind = submission.assignment_id ? assignmentKinds.get(submission.assignment_id) : undefined;
    if (kind === 'اختبار' || kind === 'quiz') summary.quizzes += 1;
    else summary.assignments += 1;
    return summary;
  }, { total: 0, assignments: 0, quizzes: 0 });
}
