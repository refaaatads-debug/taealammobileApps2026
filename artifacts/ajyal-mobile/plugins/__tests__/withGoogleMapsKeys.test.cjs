const assert = require("node:assert/strict");
const test = require("node:test");
const withGoogleMapsKeys = require("../withGoogleMapsKeys");

test("adds restricted platform keys only to native Expo config", () => {
  const priorAndroid = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const priorIos = process.env.GOOGLE_MAPS_IOS_API_KEY;
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = "android-test-key";
  process.env.GOOGLE_MAPS_IOS_API_KEY = "ios-test-key";
  try {
    const result = withGoogleMapsKeys({ android: { package: "com.example.app" }, ios: { bundleIdentifier: "com.example.app" } });
    assert.equal(result.android.config.googleMaps.apiKey, "android-test-key");
    assert.equal(result.ios.config.googleMapsApiKey, "ios-test-key");
    assert.deepEqual(result.extra.googleMapsApiKeys, { android: "android-test-key", ios: "ios-test-key" });
    assert.equal(result.android.package, "com.example.app");
    assert.equal(result.ios.bundleIdentifier, "com.example.app");
  } finally {
    if (priorAndroid === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    else process.env.GOOGLE_MAPS_ANDROID_API_KEY = priorAndroid;
    if (priorIos === undefined) delete process.env.GOOGLE_MAPS_IOS_API_KEY;
    else process.env.GOOGLE_MAPS_IOS_API_KEY = priorIos;
  }
});
