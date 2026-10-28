import assert from "node:assert/strict";
import test from "node:test";
import { buildExternalMapUrl } from "../externalMapLocation.ts";

test("uses the saved coordinates as the exact map destination", () => {
  assert.equal(
    buildExternalMapUrl({ address: "Riyadh address", latitude: 24.7136, longitude: 46.6753 }),
    "https://www.google.com/maps/search/?api=1&query=24.7136%2C46.6753",
  );
});

test("falls back to an encoded saved address when coordinates are missing or invalid", () => {
  assert.equal(
    buildExternalMapUrl({ address: "حي النرجس، الرياض", latitude: 91, longitude: 46 }),
    "https://www.google.com/maps/search/?api=1&query=%D8%AD%D9%8A%20%D8%A7%D9%84%D9%86%D8%B1%D8%AC%D8%B3%D8%8C%20%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6",
  );
  assert.equal(buildExternalMapUrl({ address: "  " }), null);
});
