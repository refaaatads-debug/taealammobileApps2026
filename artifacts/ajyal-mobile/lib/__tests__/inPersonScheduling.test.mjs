import assert from "node:assert/strict";
import test from "node:test";
import { canConfirmInPersonAttendance, firstAvailableInPersonSchedule, formatLocalDateTimeInput, getInPersonAppointmentTimes, inPersonAttendanceAction, inPersonRequestStatusLabel, parseFutureInPersonDateTime } from "../inPersonScheduling.ts";

test("round-trips local schedule input without converting it to UTC text", () => {
  const date = new Date(2026, 9, 26, 18, 45);
  assert.equal(formatLocalDateTimeInput(date), "2026-10-26T18:45");
  assert.equal(
    parseFutureInPersonDateTime("2026-10-26T18:45", date.getTime() - 2 * 60 * 60 * 1000)?.getTime(),
    date.getTime(),
  );
});

test("rejects malformed and less-than-two-hour in-person schedule times", () => {
  const now = new Date(2026, 9, 26, 12, 0).getTime();
  assert.equal(parseFutureInPersonDateTime("2026-10-26T13:59", now), null);
  assert.equal(parseFutureInPersonDateTime("2026-02-31T15:00", now), null);
  assert.equal(parseFutureInPersonDateTime("not-a-date", now), null);
});

test("offers only hourly appointments at least two hours ahead", () => {
  const now = new Date(2026, 9, 26, 11, 15).getTime();
  assert.deepEqual(getInPersonAppointmentTimes("2026-10-26", now), [
    "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
  ]);
});

test("starts with the first available hourly appointment", () => {
  const now = new Date(2026, 9, 26, 11, 15).getTime();
  assert.equal(firstAvailableInPersonSchedule(now), "2026-10-26T14:00");
});

test("only permits in-person code entry from the scheduled time through 15 minutes after", () => {
  const startsAt = new Date(2026, 9, 26, 14, 0).getTime();
  const scheduled = "2026-10-26T14:00:00";
  assert.equal(canConfirmInPersonAttendance(scheduled, startsAt - 1), false);
  assert.equal(canConfirmInPersonAttendance(scheduled, startsAt), true);
  assert.equal(canConfirmInPersonAttendance(scheduled, startsAt + 14 * 60_000 + 59_999), true);
  assert.equal(canConfirmInPersonAttendance(scheduled, startsAt + 15 * 60_000), false);
});

test("shows the in-person attendance action only during its valid window", () => {
  const scheduled = "2026-10-26T14:00:00";
  const start = new Date(2026, 9, 26, 14, 0).getTime();
  assert.equal(inPersonAttendanceAction(scheduled, "not_started", start - 1), "waiting");
  assert.equal(inPersonAttendanceAction(scheduled, "not_started", start), "enter_code");
  assert.equal(inPersonAttendanceAction(scheduled, "not_started", start + 15 * 60_000), "expired");
  assert.equal(inPersonAttendanceAction(scheduled, "in_progress", start + 20 * 60_000), "confirmed");
});

test("translates in-person request states without exposing raw server values", () => {
  assert.equal(inPersonRequestStatusLabel("open", "ar"), "بانتظار رد المعلمين");
  assert.equal(inPersonRequestStatusLabel("accepted", "en"), "Accepted");
  assert.equal(inPersonRequestStatusLabel("unexpected", "ar"), "حالة غير معروفة");
});
