import assert from "node:assert/strict";
import test from "node:test";
import { buildAssignmentNotification, dedupePlatformNotifications } from "../platformNotifications.ts";

test("booking notification fan-out keeps one notification per recipient", () => {
  const notifications = dedupePlatformNotifications([
    { recipientId: " teacher-1 ", title: " طلب جديد ", body: " الموعد الأول ", type: "booking_request" },
    { recipientId: "teacher-1", title: "طلب مكرر", body: "موعد مكرر", type: "booking_request" },
    { recipientId: "teacher-2", title: "طلب جديد", body: "الموعد الأول", type: "booking_request" },
    { recipientId: " ", title: "طلب", body: "موعد", type: "booking_request" },
  ]);

  assert.deepEqual(notifications, [
    {
      recipientId: "teacher-1",
      title: "طلب جديد",
      body: "الموعد الأول",
      type: "booking_request",
      icon: "bell",
    },
    {
      recipientId: "teacher-2",
      title: "طلب جديد",
      body: "الموعد الأول",
      type: "booking_request",
      icon: "bell",
    },
  ]);
});

test("assignment push notifications receive a stable in-app deep link per submission and event", () => {
  assert.deepEqual(buildAssignmentNotification({
    recipientId: "teacher-1",
    assignmentId: "assignment-1",
    submissionId: "submission-1",
    event: "submitted",
    assignmentTitle: "اختبار الرياضيات",
  }), {
    recipientId: "teacher-1",
    title: "حل واجب جديد",
    body: 'تم تسليم حل جديد لواجب "اختبار الرياضيات".',
    type: "assignment_submission",
    icon: "clipboard",
    link: "/assignments?assignmentId=assignment-1&submissionId=submission-1",
  });

  const first = buildAssignmentNotification({
    recipientId: "student-1",
    assignmentId: "assignment-1",
    submissionId: "submission-1",
    event: "graded",
    assignmentTitle: "اختبار الرياضيات",
  });
  const second = buildAssignmentNotification({
    recipientId: "student-1",
    assignmentId: "assignment-1",
    submissionId: "submission-2",
    event: "graded",
    assignmentTitle: "اختبار الرياضيات",
  });
  assert.notEqual(first.link, second.link);
  assert.equal(first.type, "assignment_graded");
});
