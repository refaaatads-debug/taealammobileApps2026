import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("message enrichment requests only the public identity projection", () => {
  const text = source("components/MessagesScreen.tsx");
  assert.match(text, /from\("public_profiles"\)\.select\("user_id,full_name,avatar_url"\)/);
  assert.doesNotMatch(text, /from\("profiles"\)/);
});
test("masked telephone calling remains available without fetching contact numbers", () => {
  const text = source("components/MessagesScreen.tsx");
  assert.doesNotMatch(text, /get_booking_contact|studentPhone|from\("profiles"\)/);
  assert.match(text, /conversation-phone-call/);
  assert.match(text, /conversation-internal-call/);
  const modal = source("components/MaskedPhoneCallModal.tsx");
  assert.match(modal, /invoke\("make-phone-call"/);
  assert.match(modal, /body: \{ studentId, bookingId: bookingId \|\| undefined, estimatedMinutes: minutes \}/);
  assert.match(modal, /from\("teacher_call_history"\)/);
  assert.doesNotMatch(modal, /get_booking_contact|studentPhone|student_phone|from\("profiles"\)|from\("call_logs"\)/);
});
test("incoming caller names use the public identity projection", () => {
  const text = source("contexts/InternalCallContext.tsx");
  assert.match(text, /from\('public_profiles'\)\s*\.select\('full_name'\)/);
  assert.doesNotMatch(text, /from\('profiles'\)/);
});
test("booking availability and subject lookup do not read private teacher rows", () => {
  for (const path of ["app/booking.tsx", "components/ConnectedSectionScreen.tsx"]) {
    const text = source(path);
    assert.match(text, /from\(['"]public_teacher_profiles['"]\)/);
    assert.doesNotMatch(text, /from\(['"]teacher_profiles['"]\)/);
  }
});
