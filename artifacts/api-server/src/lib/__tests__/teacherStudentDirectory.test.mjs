import assert from "node:assert/strict";
import test from "node:test";
import {
  incomingStudentRequestQuery,
  linkedStudentIds,
  studentDirectoryEntries,
} from "../teacherStudentDirectory.ts";

test("a student with only a booking request remains in the directory", () => {
  const ids = linkedStudentIds([], [], [{ student_id: "request-student" }]);
  assert.deepEqual(studentDirectoryEntries(ids, [
    { user_id: "request-student", full_name: "طالب طلب", avatar_url: null },
  ]), [{
    id: "request-student", displayName: "طالب طلب", email: null, profileImageUrl: null, progress: 0,
  }]);
});

test("booking, assignment and repeated request links produce one student", () => {
  assert.deepEqual(linkedStudentIds(
    [{ student_id: "student-a" }],
    [{ student_id: "student-a" }, { student_id: null }],
    [{ student_id: "student-a" }, { student_id: "student-b" }, { student_id: "" }],
  ), ["student-a", "student-b"]);
});

test("a missing profile does not silently turn existing student links into an empty list", () => {
  const entries = studentDirectoryEntries(["student-a"], []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "student-a");
  assert.equal(entries[0].displayName, "طالب");
});

test("online and in-person request links share one directory entry and name", () => {
  const ids = linkedStudentIds([], [], [{ student_id: "student-a" }], [
    { student_id: "student-a" }, { student_id: "in-person-only" },
  ]);
  const entries = studentDirectoryEntries(ids, [
    { user_id: "student-a", full_name: "طالب أونلاين" },
    { user_id: "in-person-only", full_name: "طالب حضوري" },
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].displayName, "طالب حضوري");
});

test("incoming requests use the same recipient and expiry restrictions as the booking inbox", () => {
  const now = "2026-10-28T12:00:00.000Z";
  const query = incomingStudentRequestQuery("teacher-a", now);
  assert.equal(query.status, "in.(open,accepted)");
  assert.equal(query.select, "student_id");
  assert.equal(query.and,
    `(or(accepted_by.eq.teacher-a,accepted_by.is.null),or(expires_at.is.null,expires_at.gte.${now}),scheduled_at.gte.${now})`);
});
