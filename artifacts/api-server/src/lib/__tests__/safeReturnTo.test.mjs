import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnTo } from "../safeReturnTo.ts";

test("preserves current same-site browser paths and in-app deep-link routes", () => {
  const paths = [
    "/",
    "/students",
    "/(tabs)/messages?student=student-1&booking=booking-1",
    "/live-session?booking=booking-1",
    "/assignments?assignmentId=assignment-1&submissionId=submission-1",
    "/notifications?tab=all",
    "/profile?name=%D8%A3%D8%AD%D9%85%D8%AF&discount=50%25",
  ];

  for (const path of paths) assert.equal(safeReturnTo(path), path);
});

test("rejects absolute, protocol-relative, and backslash-based redirect targets", () => {
  for (const target of [
    "https://outside.example",
    "//outside.example/path",
    "/\\outside.example",
    "/\\\\outside.example",
  ]) {
    assert.equal(safeReturnTo(target), "/", target);
  }
});

test("rejects encoded path separators that could change redirect parsing", () => {
  for (const target of [
    "/%2f%2foutside.example",
    "/%5coutside.example",
    "/safe%2f..%2fpath",
    "/%252f%252foutside.example",
    "/%255c%255coutside.example",
  ]) {
    assert.equal(safeReturnTo(target), "/", target);
  }
});

test("rejects control-character, oversized, and non-string targets", () => {
  for (const target of [
    undefined,
    null,
    42,
    "students",
    "/path%0d%0aLocation:%20https://outside.example",
    "/" + "a".repeat(2_048),
  ]) {
    assert.equal(safeReturnTo(target), "/", String(target));
  }
});
