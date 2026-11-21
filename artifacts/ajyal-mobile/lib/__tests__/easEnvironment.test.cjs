const assert = require("node:assert/strict");
const test = require("node:test");
const { getMissingEasVariables } = require("../../scripts/validateEasEnvironment.cjs");

test("requires Supabase URL and publishable key in the selected EAS environment", () => {
  assert.deepEqual(
    getMissingEasVariables({
      EXPO_PUBLIC_SUPABASE_URL: "https://supabase.example",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "configured-value",
    }),
    [],
  );
  assert.deepEqual(
    getMissingEasVariables({ EXPO_PUBLIC_SUPABASE_URL: "https://supabase.example" }),
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  );
});

test("reports variable names only and never returns configured values", () => {
  const missing = getMissingEasVariables({
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "do-not-expose-this-value",
  });
  assert.deepEqual(missing, ["EXPO_PUBLIC_SUPABASE_URL"]);
  assert.equal(JSON.stringify(missing).includes("do-not-expose-this-value"), false);
});
