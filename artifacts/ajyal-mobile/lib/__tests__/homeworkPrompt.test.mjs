import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeworkQuestionPrompt } from "../homeworkPrompt.ts";

test("asks the homework solver to read Arabic, Persian, and Western digits", () => {
  const prompt = buildHomeworkQuestionPrompt("");
  assert.match(prompt, /0123456789/u);
  assert.match(prompt, /٠١٢٣٤٥٦٧٨٩/u);
  assert.match(prompt, /۰۱۲۳۴۵۶۷۸۹/u);
  assert.match(prompt, /طبّعها داخلياً قبل إجراء العمليات الحسابية/u);
});

test("preserves the student's question after the numeral-reading instruction", () => {
  const prompt = buildHomeworkQuestionPrompt("احسب ١٢ + 3");
  assert.match(prompt, /سؤال الطالب الإضافي: احسب ١٢ \+ 3/u);
});
