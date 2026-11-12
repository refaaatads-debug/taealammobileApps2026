import assert from "node:assert/strict";
import test from "node:test";
import {
  getProfileTestRedirectTarget,
  isProfileUiTestMode,
} from "../profileTestPolicy.ts";

test("the isolated profile harness is only available in development web builds", () => {
  assert.equal(isProfileUiTestMode(true, "web", "true"), true);
  assert.equal(isProfileUiTestMode(false, "web", "true"), false);
  assert.equal(isProfileUiTestMode(true, "android", "true"), false);
  assert.equal(isProfileUiTestMode(false, "android", "true"), false);
  assert.equal(isProfileUiTestMode(true, "ios", "true"), false);
  assert.equal(isProfileUiTestMode(true, "web", "false"), false);
});

test("a disabled profile test route redirects to the standard app entry path", () => {
  assert.equal(getProfileTestRedirectTarget(false), "/");
  assert.equal(getProfileTestRedirectTarget(true), null);
});