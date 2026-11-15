import assert from "node:assert/strict";
import test from "node:test";
import { getAddressDeleteFailureMessage, getLocationSaveFailureMessage } from "../profileAddressErrors.ts";

test("linked saved addresses explain why deletion was rejected", () => {
  assert.match(getAddressDeleteFailureMessage("23503", "ar"), /مرتبط بطلب أو حجز سابق/);
  assert.match(getAddressDeleteFailureMessage("23503", "en"), /linked to an earlier request or booking/);
});

test("database permission failures are distinct from network errors", () => {
  assert.match(getAddressDeleteFailureMessage("42501", "ar"), /صلاحيات قاعدة البيانات/);
  assert.match(getAddressDeleteFailureMessage("42501", "en"), /did not authorize/);
  assert.match(getAddressDeleteFailureMessage(null, "ar"), /تحقق من الاتصال/);
});

test("location save errors explain database permission and missing RPC failures", () => {
  assert.match(getLocationSaveFailureMessage({ code: "42501" }, "ar"), /صلاحيات قاعدة البيانات/);
  assert.match(getLocationSaveFailureMessage({ code: "PGRST202" }, "en"), /not available on the server/);
});

test("unknown location save errors include their safe diagnostic code", () => {
  assert.match(getLocationSaveFailureMessage({ code: "XX000" }, "ar"), /XX000/);
  assert.match(getLocationSaveFailureMessage({ message: "Network request failed" }, "en"), /Could not reach the service/);
});
