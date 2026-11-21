import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelAjyalSession,
  completeAjyalAssignment,
  loadAjyalNotifications,
  loadAjyalProfile,
  mapAjyalNotification,
  markAjyalNotificationRead,
  markAllAjyalNotificationsRead,
} from "../ajyalDirectData.ts";

const userId = "a8c26de0-7c3b-4f52-9b99-13cb114cf844";
const teacherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const assignmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const bookingId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = "select";
    this.filters = [];
    this.orderBy = null;
    this.maxRows = null;
    this.values = null;
  }

  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  or(filters) {
    const clauses = filters.replace(/^\(|\)$/g, "").split(",");
    this.filters.push((row) => clauses.some((clause) => {
      const [column, operator, value] = clause.split(".");
      return operator === "eq"
        ? String(row[column]) === value
        : operator === "is" && value === "null" && row[column] == null;
    }));
    return this;
  }
  order(column, options = {}) { this.orderBy = { column, ascending: options.ascending !== false }; return this; }
  limit(count) { this.maxRows = count; return this; }
  update(values) { this.action = "update"; this.values = values; return this; }
  insert(values) { this.action = "insert"; this.values = values; return this; }

  execute() {
    const failure = this.client.failures[`${this.table}:${this.action}`];
    if (failure) return { data: null, error: { message: failure } };
    const table = this.client.tables[this.table] ?? (this.client.tables[this.table] = []);
    if (this.action === "insert") {
      const inserted = (Array.isArray(this.values) ? this.values : [this.values]).map((row) => ({ ...row }));
      table.push(...inserted);
      return { data: inserted, error: null };
    }
    const matched = table.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.action === "update") {
      for (const row of matched) Object.assign(row, this.values);
    }
    let rows = matched.map((row) => ({ ...row }));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((left, right) => {
        const a = String(left[column] ?? "");
        const b = String(right[column] ?? "");
        return (a.localeCompare(b)) * (ascending ? 1 : -1);
      });
    }
    if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
    return { data: rows, error: null };
  }

  async maybeSingle() {
    const result = this.execute();
    return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }
}

class FakeSupabase {
  constructor(tables = {}) {
    this.tables = structuredClone(tables);
    this.failures = {};
    this.rpcResult = { data: 0, error: null };
    this.from = (table) => new FakeQuery(this, table);
    this.rpc = async () => this.rpcResult;
  }
}

const authUser = {
  id: userId,
  email: "learner@example.test",
  firstName: "محمد",
  lastName: "رفعت",
  profileImageUrl: null,
};

test("loads a resolved role and account profile from RLS-scoped tables", async () => {
  const client = new FakeSupabase({
    profiles: [{ user_id: userId, full_name: "محمد رفعت", teaching_stage: "متوسط" }],
    user_roles: [{ user_id: userId, role: "teacher" }],
    teacher_profiles: [{ user_id: userId, is_approved: true }],
    user_warnings: [],
  });

  const profile = await loadAjyalProfile(client, authUser);

  assert.equal(profile?.role, "teacher");
  assert.deepEqual(profile?.roles, ["teacher"]);
  assert.equal(profile?.teacherApproved, true);
  assert.equal(profile?.teachingStage, "المتوسطة");
  assert.equal(profile?.displayName, "محمد رفعت");
});

test("does not resolve a student role when role lookup fails or returns no role", async () => {
  const failedClient = new FakeSupabase({
    profiles: [{ user_id: userId, full_name: "طالب" }],
    user_roles: [],
  });
  failedClient.failures["user_roles:select"] = "permission denied";
  await assert.rejects(loadAjyalProfile(failedClient, authUser), /permission denied/);

  const emptyClient = new FakeSupabase({
    profiles: [{ user_id: userId, full_name: "طالب" }],
    user_roles: [],
    teacher_profiles: [],
  });
  assert.equal(await loadAjyalProfile(emptyClient, authUser), null);
});

test("loads notification rows with the platform route, unread state, and safe image URL", async () => {
  const now = Date.parse("2026-11-15T09:00:00.000Z");
  const row = {
    id: "notice-1",
    user_id: userId,
    title: "تم إلغاء الحصة",
    body: "تم إلغاء الموعد",
    type: "booking_cancelled",
    is_read: false,
    created_at: new Date(now - 60_000).toISOString(),
    metadata: { image: { url: "https://images.example.test/lesson.png" } },
  };
  const client = new FakeSupabase({ notifications: [row] });
  const mapped = mapAjyalNotification(row, now);
  const notifications = await loadAjyalNotifications(client, userId, now);

  assert.equal(mapped.route, "/bookings");
  assert.equal(mapped.unread, true);
  assert.equal(mapped.imageUrl, "https://images.example.test/lesson.png");
  assert.equal(notifications[0].id, "notice-1");
  assert.equal(notifications[0].time, "منذ 1 دقيقة");
});

test("notification writes report failures and only update the signed-in user's rows", async () => {
  const client = new FakeSupabase({
    notifications: [
      { id: "own", user_id: userId, is_read: false },
      { id: "other", user_id: teacherId, is_read: false },
    ],
  });

  await markAjyalNotificationRead(client, userId, "own");
  assert.equal(client.tables.notifications[0].is_read, true);
  assert.equal(client.tables.notifications[1].is_read, false);
  await markAllAjyalNotificationsRead(client, userId);
  assert.equal(client.tables.notifications[1].is_read, false);

  client.failures["notifications:update"] = "write failed";
  await assert.rejects(markAjyalNotificationRead(client, userId, "own"), /write failed/);
  await assert.rejects(markAllAjyalNotificationsRead(client, userId), /write failed/);
});

test("assignment completion requires a submitted answer and an active assignment", async () => {
  const client = new FakeSupabase({
    assignment_submissions: [{ id: "submission-1", assignment_id: assignmentId, student_id: userId }],
    assignments: [{ id: assignmentId, student_id: null, status: "active" }],
  });
  await completeAjyalAssignment(client, userId, assignmentId);
  assert.equal(client.tables.assignments[0].status, "active");

  const missingSubmission = new FakeSupabase({
    assignment_submissions: [],
    assignments: [{ id: assignmentId, student_id: null, status: "active" }],
  });
  await assert.rejects(completeAjyalAssignment(missingSubmission, userId, assignmentId), /أرسل إجابات الواجب/);

  const inactiveAssignment = new FakeSupabase({
    assignment_submissions: [{ id: "submission-1", assignment_id: assignmentId, student_id: userId }],
    assignments: [{ id: assignmentId, student_id: null, status: "archived" }],
  });
  await assert.rejects(completeAjyalAssignment(inactiveAssignment, userId, assignmentId), /غير موجود أو لم يعد متاحًا/);
});

test("session cancellation updates the booking and notifies its other participant", async () => {
  const client = new FakeSupabase({
    bookings: [{
      id: bookingId,
      student_id: userId,
      teacher_id: teacherId,
      status: "confirmed",
      session_status: "not_started",
      scheduled_at: "2026-11-20T12:00:00.000Z",
      subjects: { name: "رياضيات" },
    }],
    user_roles: [{ user_id: userId, role: "student" }],
    profiles: [{ user_id: teacherId, full_name: "معلم الرياضيات" }],
    notifications: [],
  });

  await cancelAjyalSession(client, userId, bookingId, undefined, new Date("2026-11-15T09:00:00.000Z"));

  assert.equal(client.tables.bookings[0].status, "cancelled");
  assert.equal(client.tables.bookings[0].session_status, "cancelled");
  assert.equal(client.tables.notifications.length, 1);
  assert.equal(client.tables.notifications[0].user_id, teacherId);
  assert.equal(client.tables.notifications[0].type, "booking_cancelled");
});

test("teacher cancellation requires a reason and failed booking writes do not report success", async () => {
  const base = {
    bookings: [{
      id: bookingId,
      student_id: userId,
      teacher_id: teacherId,
      status: "confirmed",
      session_status: "not_started",
      scheduled_at: "2026-11-20T12:00:00.000Z",
    }],
    user_roles: [{ user_id: userId, role: "teacher" }],
    notifications: [],
  };
  const teacherClient = new FakeSupabase(base);
  await assert.rejects(cancelAjyalSession(teacherClient, userId, bookingId), /اكتب سبب الإلغاء/);
  assert.equal(teacherClient.tables.bookings[0].status, "confirmed");

  const failingClient = new FakeSupabase(base);
  failingClient.failures["bookings:update"] = "write failed";
  await assert.rejects(cancelAjyalSession(failingClient, userId, bookingId, "ظرف طارئ"), /write failed/);
  assert.equal(failingClient.tables.bookings[0].status, "confirmed");
  assert.equal(failingClient.tables.notifications.length, 0);
});
