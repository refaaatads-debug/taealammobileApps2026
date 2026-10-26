import assert from "node:assert/strict";
import test from "node:test";
import { selectSavedAddress } from "../inPersonAddressSelection.ts";

const primary = { id: "primary", city_id: "riyadh", is_primary: true };
const secondary = { id: "secondary", city_id: "jeddah", is_primary: false };

test("keeps the selected saved address when it still exists", () => {
  assert.equal(selectSavedAddress([primary, secondary], "secondary"), secondary);
});

test("uses the primary saved address when the prior selection was deleted", () => {
  assert.equal(selectSavedAddress([primary, secondary], "deleted"), primary);
});

test("uses the first saved address if none is marked primary", () => {
  assert.equal(selectSavedAddress([secondary], ""), secondary);
});

test("returns null when no saved address exists", () => {
  assert.equal(selectSavedAddress([], ""), null);
});
