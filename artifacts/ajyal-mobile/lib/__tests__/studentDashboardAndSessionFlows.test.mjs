import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dashboardSource = readFileSync(path.join(projectRoot, "app/(tabs)/index.tsx"), "utf8");
const dashboardUiSource = readFileSync(path.join(projectRoot, "components/AjyalUI.tsx"), "utf8");
const sessionSource = readFileSync(path.join(projectRoot, "hooks/useSessionWebRTC.ts"), "utf8");
const inPersonSource = readFileSync(path.join(projectRoot, "app/in-person.tsx"), "utf8");
const messagesSource = readFileSync(path.join(projectRoot, "components/MessagesScreen.tsx"), "utf8");

test("the student home teacher-search action opens the booking form", () => {
  assert.ok(dashboardSource.includes("'find-teacher': '/booking'"));
});

test("assignments render as a compact tile after learning materials", () => {
  assert.ok(dashboardUiSource.includes("'bookings', 'materials', 'assignments'"));
  assert.ok(dashboardUiSource.includes("const wideActionId = role === 'student' ? null : 'review';"));
});

test("mobile does not repeatedly send join signals while the peer is negotiating", () => {
  assert.ok(sessionSource.includes("await sendSignal('join', { userId });"));
  assert.equal(sessionSource.includes("joinRetryIntervalRef"), false);
  assert.ok(sessionSource.includes("retry: 'realtime-reconnect'"));
});

test("instant-session requests await the idempotent notification route and surface delivery status", () => {
  assert.ok(messagesSource.includes('await customFetch<{ delivered: boolean }>("/api/push/notifications"'));
  assert.ok(messagesSource.includes("notificationQueued"));
  assert.ok(messagesSource.includes("تعذر تأكيد إشعار المعلم"));
  assert.equal(messagesSource.includes('.from("notifications")\n      .insert({'), false);
});

test("in-person subject selection uses the platform catalog and filters teachers by stage", () => {
  assert.ok(inPersonSource.includes("options={subjects.map((subject) => subject.name)}"));
  assert.ok(inPersonSource.includes("p_subject_id: subjectId"));
  assert.ok(inPersonSource.includes("p_teaching_stage: teachingStage"));
  assert.equal(inPersonSource.includes("getApprovedStageSubjectIds"), false);
});
