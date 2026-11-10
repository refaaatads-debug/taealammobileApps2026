import assert from "node:assert/strict";
import test from "node:test";
import {
  getLearningMaterialHostname,
  getLearningMaterialLabel,
  getSafeLearningMaterialUrl,
} from "../learningMaterialLinks.ts";

test("splits the platform's category and source name", () => {
  assert.deepEqual(getLearningMaterialLabel("الكتب المدرسية - منهجي"), {
    category: "الكتب المدرسية",
    title: "منهجي",
  });
});

test("uses a general source label when a name has no category", () => {
  assert.deepEqual(getLearningMaterialLabel("مصدر رياضيات"), {
    category: "مصدر تعليمي",
    title: "مصدر رياضيات",
  });
});

test("only returns HTTPS links and their hostname", () => {
  assert.equal(getSafeLearningMaterialUrl("https://example.com/books"), "https://example.com/books");
  assert.equal(getLearningMaterialHostname("https://www.example.com/books"), "www.example.com");
  assert.equal(getSafeLearningMaterialUrl("http://example.com/books"), null);
  assert.equal(getSafeLearningMaterialUrl("javascript:alert(1)"), null);
});
