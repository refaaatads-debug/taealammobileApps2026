import assert from "node:assert/strict";
import test from "node:test";
import { getAddressDeleteFailureMessage } from "../profileAddressErrors.ts";

test("linked saved addresses explain why deletion was rejected", () => {
  assert.match(getAddressDeleteFailureMessage("23503", "ar"), /مرتبط بطلب أو حجز سابق/);
  assert.match(getAddressDeleteFailureMessage("23503", "en"), /linked to an earlier request or booking/);
});

test("database permission failures are distinct from network errors", () => {
  assert.match(getAddressDeleteFailureMessage("42501", "ar"), /صلاحيات قاعدة البيانات/);
  assert.match(getAddressDeleteFailureMessage("42501", "en"), /did not authorize/);
  assert.match(getAddressDeleteFailureMessage(null, "ar"), /تحقق من الاتصال/);
});
