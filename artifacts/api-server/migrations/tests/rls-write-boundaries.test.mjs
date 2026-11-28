import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../2026-10-28-protect-subscription-and-submission-writes.sql",
  import.meta.url,
);
const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

test("prepared migration is clearly marked and transaction-wrapped", () => {
  assert.match(sql, /prepared only/);
  assert.match(sql, /\nbegin;/);
  assert.match(sql, /commit;\s*$/);
});

test("subscription reads remain available while client insert/update are revoked", () => {
  assert.match(
    sql,
    /revoke insert,\s*update on table public\.user_subscriptions\s+from public,\s*anon,\s*authenticated;/,
  );
  assert.match(
    sql,
    /grant insert,\s*update on table public\.user_subscriptions\s+to service_role;/,
  );
  assert.doesNotMatch(sql, /revoke\s+select/);
});

test("students can read their own submissions and insert only ungraded submissions", () => {
  assert.match(sql, /drop policy if exists "students manage own submissions"/);
  assert.match(
    sql,
    /create policy "students read own assignment submissions"\s+on public\.assignment_submissions\s+for select\s+to authenticated\s+using\s*\(student_id = auth\.uid\(\)\)/,
  );
  assert.match(
    sql,
    /create policy "students submit ungraded own work"\s+on public\.assignment_submissions\s+for insert\s+to authenticated\s+with check\s*\(/,
  );
  for (const field of [
    "ai_score",
    "ai_feedback",
    "ai_breakdown",
    "teacher_score",
    "teacher_feedback",
    "final_score",
    "graded_at",
    "reviewed_at",
  ]) {
    assert.match(sql, new RegExp(`\\b${field}\\s+is null\\b`));
  }
  assert.match(sql, /status = 'submitted'/);
});

test("migration does not modify booking, session, wallet, price, or historical rows", () => {
  const statements = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(statements, /^\s*update\s+public\./m);
  assert.doesNotMatch(statements, /^\s*delete\s+from\s+public\./m);
  assert.doesNotMatch(statements, /\btruncate\s+public\./);
  assert.doesNotMatch(statements, /\bdrop\s+table\s+public\./);
  assert.doesNotMatch(sql, /\b(bookings|sessions|wallet|teacher_earnings|pricing)\b/);
});
