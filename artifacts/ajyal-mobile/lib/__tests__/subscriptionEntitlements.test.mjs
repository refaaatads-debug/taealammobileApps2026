import assert from "node:assert/strict";
import test from "node:test";
import { hasAiTutorEntitlement } from "../subscriptionEntitlements.ts";

const activeSubscription = (overrides = {}) => ({
  plan_id: "ai-plan",
  is_active: true,
  remaining_minutes: 60,
  ends_at: "2099-01-01T00:00:00.000Z",
  ...overrides,
});

test("allows an active subscription whose plan includes the AI tutor", () => {
  assert.equal(
    hasAiTutorEntitlement([activeSubscription()], [{ id: "ai-plan", has_ai_tutor: true }], Date.parse("2026-09-07T00:00:00.000Z")),
    true,
  );
});

test("recognizes the Arabic AI tutor feature listed in plan features", () => {
  assert.equal(
    hasAiTutorEntitlement([activeSubscription()], [{ id: "ai-plan", features: ["مدرس ذكي AI"] }], Date.parse("2026-09-07T00:00:00.000Z")),
    true,
  );
});

test("does not allow a plan without the AI tutor feature", () => {
  assert.equal(
    hasAiTutorEntitlement([activeSubscription()], [{ id: "ai-plan", has_ai_tutor: false }], Date.parse("2026-09-07T00:00:00.000Z")),
    false,
  );
});

test("does not allow expired or depleted subscriptions", () => {
  const plan = [{ id: "ai-plan", has_ai_tutor: true }];
  assert.equal(
    hasAiTutorEntitlement([activeSubscription({ ends_at: "2020-01-01T00:00:00.000Z" })], plan, Date.parse("2026-09-07T00:00:00.000Z")),
    false,
  );
  assert.equal(
    hasAiTutorEntitlement([activeSubscription({ remaining_minutes: 0 })], plan, Date.parse("2026-09-07T00:00:00.000Z")),
    false,
  );
});