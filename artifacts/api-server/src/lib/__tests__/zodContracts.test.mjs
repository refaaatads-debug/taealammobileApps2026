import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateBookingRequestBody,
  CreateBookingRequestGroupBody,
  CreateBookingRequestResponse,
  GetStudentDashboardResponse,
  GetTeacherDashboardResponse,
} from "@workspace/api-zod";

const bookingDate = "2035-04-01T10:00:00.000Z";

test("single booking schema keeps valid durations and rejects fractional minutes", () => {
  const valid = CreateBookingRequestBody.parse({
    teacherId: null,
    subject: "رياضيات",
    teachingStage: "ثانوي",
    startsAt: bookingDate,
    durationMinutes: 60,
  });

  assert.equal(valid.durationMinutes, 60);
  assert.ok(valid.startsAt instanceof Date);
  assert.equal(
    CreateBookingRequestBody.safeParse({
      teacherId: null,
      subject: "رياضيات",
      teachingStage: "ثانوي",
      startsAt: bookingDate,
      durationMinutes: 60.5,
    }).success,
    false,
  );
});

test("group booking accepts 20 slots and rejects oversized input before item parsing", () => {
  const base = {
    teacherId: null,
    subject: "رياضيات",
    teachingStage: "ثانوي",
  };
  const validSlots = Array.from({ length: 20 }, (_, index) => ({
    startsAt: `2035-04-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    durationMinutes: 60,
  }));

  assert.equal(
    CreateBookingRequestGroupBody.safeParse({ ...base, slots: validSlots }).success,
    true,
  );

  const oversized = CreateBookingRequestGroupBody.safeParse({
    ...base,
    slots: Array.from({ length: 21 }, () => null),
  });

  assert.equal(oversized.success, false);
  if (oversized.success) return;
  assert.equal(oversized.error.issues.length, 1);
  assert.equal(oversized.error.issues[0]?.code, "too_big");
});

test("booking response keeps platform price and status values", () => {
  const response = CreateBookingRequestResponse.parse({
    id: "request-1",
    studentId: "student-1",
    studentName: "طالب",
    teacherId: "teacher-1",
    subject: "رياضيات",
    scheduledAt: bookingDate,
    durationMinutes: 60,
    price: 37.5,
    status: "accepted",
    acceptedBy: "teacher-1",
    expiresAt: null,
    groupId: "group-1",
  });

  assert.equal(response.price, 37.5);
  assert.equal(response.status, "accepted");
});

test("dashboard schemas preserve student balance and teacher earnings", () => {
  const student = GetStudentDashboardResponse.parse({
    profileComplete: true,
    missingProfileFields: [],
    stats: {
      completedSessions: 2,
      cancelledSessions: 0,
      progress: 80,
      points: 40,
    },
    balance: {
      remainingMinutes: 60,
      sessionsRemaining: 2,
      endsAt: null,
      planName: "باقة",
      planTier: "standard",
      sessionDurationMinutes: 30,
    },
    openBookingRequests: 1,
    unreadNotifications: 0,
    upcomingSessions: [],
    degradedSections: [],
  });
  const teacher = GetTeacherDashboardResponse.parse({
    teacherApproved: true,
    stats: {
      earnings: 123.45,
      students: 1,
      sessions: 2,
      rating: 4.8,
    },
    openRequests: 0,
    unreadNotifications: 0,
    warningCount: 0,
    upcomingSessions: [],
    degradedSections: [],
  });

  assert.equal(student.balance?.remainingMinutes, 60);
  assert.equal(student.balance?.sessionsRemaining, 2);
  assert.equal(teacher.stats.earnings, 123.45);
});
