import assert from "node:assert/strict";
import test from "node:test";
import { buildAssignmentPayload, parseAssignmentDueDate, toggleMultiSelectAnswer, validateAssignmentDraft } from "../assignmentAuthoring.ts";

const textQuestion = (patch = {}) => ({
  id: "question-1",
  text: "اكتب الإجابة",
  type: "text",
  options: [],
  correct: "",
  points: 5,
  ...patch,
});

test("requires a title and at least one question for quizzes", () => {
  const emptyDate = { kind: "empty" };
  assert.equal(validateAssignmentDraft({ title: " ", contentType: "assignment", questions: [], dueDate: emptyDate }), "title_required");
  assert.equal(validateAssignmentDraft({ title: "اختبار", contentType: "quiz", questions: [], dueDate: emptyDate }), "quiz_question_required");
  assert.equal(validateAssignmentDraft({ title: "واجب", contentType: "assignment", questions: [], dueDate: emptyDate }), null);
});

test("validates choice options and matching correct answers", () => {
  const emptyDate = { kind: "empty" };
  const question = textQuestion({
    type: "multiple_choice",
    options: ["أ", "ب"],
    correct: "ج",
  });
  assert.equal(validateAssignmentDraft({ title: "اختبار", contentType: "quiz", questions: [question], dueDate: emptyDate }), "invalid_question");
  assert.equal(validateAssignmentDraft({
    title: "اختبار",
    contentType: "quiz",
    questions: [{ ...question, correct: "أ" }],
    dueDate: emptyDate,
  }), null);
});

test("accepts multiple-select answers and requires a valid true/false key", () => {
  const emptyDate = { kind: "empty" };
  assert.equal(validateAssignmentDraft({
    title: "اختبار",
    contentType: "quiz",
    questions: [textQuestion({ type: "multiple_select", options: ["أ", "ب", "ج"], correct: "أ, ج" })],
    dueDate: emptyDate,
  }), null);
  assert.equal(validateAssignmentDraft({
    title: "اختبار",
    contentType: "quiz",
    questions: [textQuestion({ type: "true_false", correct: "ربما" })],
    dueDate: emptyDate,
  }), "invalid_question");
});

test("parses a local due date and rejects incomplete or impossible values", () => {
  assert.equal(parseAssignmentDueDate("", "").kind, "empty");
  assert.equal(parseAssignmentDueDate("2026-11-14", "").kind, "invalid");
  assert.equal(parseAssignmentDueDate("2026-02-31", "18:30").kind, "invalid");
  const parsed = parseAssignmentDueDate("2026-11-14", "18:30");
  const expected = new Date(2026, 10, 14, 18, 30).toISOString();
  assert.deepEqual(parsed, { kind: "valid", value: expected });
  assert.equal(parseAssignmentDueDate("٢٠٢٦-١١-١٤", "١٨:٣٠").kind, "valid");
});

test("builds the shared platform payload with a stable question contract", () => {
  const payload = buildAssignmentPayload({
    assignmentId: "assignment-1",
    teacherId: "teacher-1",
    studentId: "student-1",
    contentType: "quiz",
    title: "  اختبار الوحدة  ",
    description: " ",
    subjectId: "",
    stage: "متوسط",
    dueDate: { kind: "valid", value: "2026-11-14T15:30:00.000Z" },
    questions: [textQuestion({ type: "multiple_choice", options: [" أ ", "", "ب"], correct: "أ" })],
    attachments: [],
  });
  assert.equal(payload.title, "اختبار الوحدة");
  assert.equal(payload.id, "assignment-1");
  assert.equal(payload.description, null);
  assert.equal(payload.subject_id, null);
  assert.equal(payload.teaching_stage, "متوسط");
  assert.equal(payload.total_points, 5);
  assert.equal(payload.questions[0].correct, "أ");
  assert.equal(payload.questions[0].correct_answer, "أ");
  assert.deepEqual(payload.questions[0].options, ["أ", "ب"]);
});

test("toggles multi-select choices without adding duplicate values", () => {
  assert.deepEqual(toggleMultiSelectAnswer(["أ"], "ب"), ["أ", "ب"]);
  assert.deepEqual(toggleMultiSelectAnswer(["أ", "ب"], "أ"), ["ب"]);
});
