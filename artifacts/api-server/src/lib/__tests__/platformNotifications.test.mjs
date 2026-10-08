import assert from "node:assert/strict";
import test from "node:test";
import { dedupePlatformNotifications } from "../platformNotifications.ts";

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
