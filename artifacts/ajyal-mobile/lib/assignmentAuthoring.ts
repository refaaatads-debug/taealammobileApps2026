export type AssignmentContentType = 'assignment' | 'quiz';
export type AssignmentQuestionType = 'text' | 'multiple_choice' | 'multiple_select' | 'true_false';

export type AssignmentQuestionDraft = {
  id: string;
  text: string;
  type: AssignmentQuestionType;
  options: string[];
  correct: string;
  correct_answer?: string | null;
  explanation?: string;
  points: number;
};

export type AssignmentAttachment = {
  name: string;
  url: string;
  type: string;
};

export type DueDateParse =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'valid'; value: string };

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function parseAssignmentDueDate(dateValue: string, timeValue: string): DueDateParse {
  const date = normalizeDigits(dateValue.trim());
  const time = normalizeDigits(timeValue.trim());
  if (!date && !time) return { kind: 'empty' };
  if (!date || !time) return { kind: 'invalid' };

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return { kind: 'invalid' };

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    localDate.getFullYear() !== year
    || localDate.getMonth() !== month - 1
    || localDate.getDate() !== day
    || localDate.getHours() !== hour
    || localDate.getMinutes() !== minute
  ) {
    return { kind: 'invalid' };
  }

  return { kind: 'valid', value: localDate.toISOString() };
}

export function validateAssignmentDraft(input: {
  title: string;
  contentType: AssignmentContentType;
  questions: AssignmentQuestionDraft[];
  dueDate: DueDateParse;
}): 'title_required' | 'quiz_question_required' | 'invalid_question' | 'invalid_due_date' | null {
  if (!input.title.trim()) return 'title_required';
  if (input.dueDate.kind === 'invalid') return 'invalid_due_date';
  if (input.contentType === 'quiz' && input.questions.length === 0) return 'quiz_question_required';

  for (const question of input.questions) {
    if (!question.text.trim() || !Number.isFinite(Number(question.points)) || Number(question.points) <= 0) {
      return 'invalid_question';
    }
    if (question.type === 'multiple_choice' || question.type === 'multiple_select') {
      const options = question.options.map((option) => option.trim()).filter(Boolean);
      const correctAnswers = question.correct.split(',').map((answer) => answer.trim()).filter(Boolean);
      if (
        options.length < 2
        || correctAnswers.length === 0
        || correctAnswers.some((answer) => !options.includes(answer))
        || (question.type === 'multiple_choice' && correctAnswers.length !== 1)
      ) {
        return 'invalid_question';
      }
    }
    if (question.type === 'true_false' && !['صح', 'خطأ'].includes(question.correct.trim())) {
      return 'invalid_question';
    }
  }

  return null;
}

export function buildAssignmentPayload(input: {
  assignmentId: string;
  teacherId: string;
  studentId: string | null;
  contentType: AssignmentContentType;
  title: string;
  description: string;
  subjectId: string;
  stage: string;
  dueDate: DueDateParse;
  questions: AssignmentQuestionDraft[];
  attachments: AssignmentAttachment[];
}) {
  const questions = input.questions.map((question) => {
    const correctAnswer = question.correct.trim() || question.correct_answer?.trim() || null;
    return {
      ...question,
      text: question.text.trim(),
      options: question.options.map((option) => option.trim()).filter(Boolean),
      correct: correctAnswer,
      correct_answer: correctAnswer,
      points: Number(question.points),
    };
  });

  return {
    id: input.assignmentId,
    teacher_id: input.teacherId,
    student_id: input.studentId,
    content_type: input.contentType,
    title: input.title.trim(),
    description: input.description.trim() || null,
    subject_id: input.subjectId || null,
    teaching_stage: input.stage.trim() || null,
    questions,
    attachments: input.attachments.map(({ name, url, type }) => ({ name, url, type })),
    total_points: questions.reduce((total, question) => total + question.points, 0) || 100,
    due_date: input.dueDate.kind === 'valid' ? input.dueDate.value : null,
  };
}

export function toggleMultiSelectAnswer(current: string[], option: string): string[] {
  return current.includes(option)
    ? current.filter((item) => item !== option)
    : [...current, option];
}
