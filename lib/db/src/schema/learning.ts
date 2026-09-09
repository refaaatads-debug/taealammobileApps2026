import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const bookingStatusEnum = pgEnum("booking_status", [
  "scheduled",
  "completed",
  "cancelled",
]);
export const assignmentKindEnum = pgEnum("assignment_kind", ["واجب", "اختبار"]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "قيد التقدم",
  "لم يبدأ",
  "مكتمل",
]);

const currentUser = sql`current_setting('app.user_id', true)`;

export const bookingsTable = pgTable("bookings", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  teacherId: text("teacher_id").notNull(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  tone: text("tone").notNull().default("teal"),
  status: bookingStatusEnum("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.studentId], foreignColumns: [usersTable.id], name: "bookings_student_id_fk" }),
  foreignKey({ columns: [table.teacherId], foreignColumns: [usersTable.id], name: "bookings_teacher_id_fk" }),
  index("bookings_student_idx").on(table.studentId, table.startsAt),
  index("bookings_teacher_idx").on(table.teacherId, table.startsAt),
  pgPolicy("bookings_user_policy", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`${table.studentId} = ${currentUser} OR ${table.teacherId} = ${currentUser}`,
    withCheck: sql`${table.studentId} = ${currentUser} OR ${table.teacherId} = ${currentUser}`,
  }),
]).enableRLS();

export const assignmentsTable = pgTable("assignments", {
  id: text("id").primaryKey(),
  studentId: text("student_id"),
  teacherId: text("teacher_id").notNull(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  progress: integer("progress").notNull().default(0),
  kind: assignmentKindEnum("kind").notNull(),
  status: assignmentStatusEnum("status").notNull().default("لم يبدأ"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.studentId], foreignColumns: [usersTable.id], name: "assignments_student_id_fk" }),
  foreignKey({ columns: [table.teacherId], foreignColumns: [usersTable.id], name: "assignments_teacher_id_fk" }),
  index("assignments_student_idx").on(table.studentId, table.dueAt),
  index("assignments_teacher_idx").on(table.teacherId, table.dueAt),
  pgPolicy("assignments_user_policy", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`${table.studentId} = ${currentUser} OR ${table.teacherId} = ${currentUser}`,
    withCheck: sql`${table.studentId} = ${currentUser} OR ${table.teacherId} = ${currentUser}`,
  }),
]).enableRLS();

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  icon: text("icon").notNull().default("bell"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => [
  foreignKey({ columns: [table.userId], foreignColumns: [usersTable.id], name: "notifications_user_id_fk" }),
  index("notifications_user_idx").on(table.userId, table.createdAt),
  pgPolicy("notifications_user_policy", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`${table.userId} = ${currentUser}`,
    // Fan-out is allowed only inside an API transaction that explicitly opts
    // into the server-write context; reads and updates remain recipient-only.
    withCheck: sql`${table.userId} = ${currentUser} OR current_setting('app.server_write', true) = 'true'`,
  }),
]).enableRLS();

export const pushTokensTable = pgTable("push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.userId], foreignColumns: [usersTable.id], name: "push_tokens_user_id_fk" }),
  index("push_tokens_user_idx").on(table.userId),
  uniqueIndex("push_tokens_user_unique").on(table.userId),
  uniqueIndex("push_tokens_token_unique").on(table.token),
  pgPolicy("push_tokens_user_policy", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`${table.userId} = ${currentUser} OR current_setting('app.server_write', true) = 'true'`,
    withCheck: sql`${table.userId} = ${currentUser} OR current_setting('app.server_write', true) = 'true'`,
  }),
]).enableRLS();

export type Booking = typeof bookingsTable.$inferSelect;
export type Assignment = typeof assignmentsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type PushToken = typeof pushTokensTable.$inferSelect;