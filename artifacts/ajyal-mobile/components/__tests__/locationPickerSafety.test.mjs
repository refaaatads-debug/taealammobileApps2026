import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const picker = readFileSync(path.join(projectRoot, "components/InPersonLocationPicker.native.tsx"), "utf8");
const profile = readFileSync(path.join(projectRoot, "components/ProfileInPersonSection.tsx"), "utf8");
const appConfig = JSON.parse(readFileSync(path.join(projectRoot, "app.json"), "utf8"));

test("the native map stays behind the Google Maps key guard", () => {
  assert.match(picker, /if \(!platformKey\) \{\s*setSearchError\(mapKeyMissingMessage\);\s*return;/);
  assert.match(picker, /\{platformKey \? \(\s*<MapView/);
  assert.match(picker, /الخريطة غير مهيأة/);
});

test("choosing a place only stages it; the profile callback runs on explicit confirmation", () => {
  const choosePlaceBody = picker.match(/const choosePlace = async[\s\S]*?\n  };\n\n  const locateMe/);
  assert.ok(choosePlaceBody);
  assert.doesNotMatch(choosePlaceBody[0], /onConfirmLocation/);
  assert.match(picker, /const confirmLocation = \(\) => \{[\s\S]*?onConfirmLocation\?\.\(pendingCoordinate\.latitude, pendingCoordinate\.longitude, pendingAddress, pendingPlace\)/);
  assert.match(profile, /onConfirmLocation=\{handleLocationConfirm\}/);
  const profileCallback = profile.match(/const handleLocationConfirm = \([\s\S]*?\n  \};/);
  assert.ok(profileCallback);
  assert.doesNotMatch(profileCallback[0], /supabase|\.insert\(|\.update\(/);
});

test("location lookup requests foreground access and offers settings after a permanent denial", () => {
  assert.match(picker, /Location\.requestForegroundPermissionsAsync\(\)/);
  assert.match(picker, /!locationPermission\.canAskAgain/);
  assert.match(picker, /Linking\.openSettings\(\)/);
  assert.match(picker, /onPress=\{\(event\) => \{\s*Keyboard\.dismiss\(\);\s*void resolveCoordinate\(event\.nativeEvent\.coordinate\);\s*\}\}/);
});

test("the native app declares a foreground-only location permission", () => {
  const locationPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-location");
  assert.ok(locationPlugin);
  assert.match(locationPlugin[1].locationWhenInUsePermission, /موقعك/);
  assert.notEqual(locationPlugin[1].isAndroidBackgroundLocationEnabled, true);
  assert.notEqual(locationPlugin[1].isIosBackgroundLocationEnabled, true);
});

test("manual map coordinates are reverse-geocoded without creating a Places city", () => {
  const resolveBody = picker.match(/const resolveCoordinate = async[\s\S]*?\n  };\n\n  const choosePlace/);
  assert.ok(resolveBody);
  assert.match(resolveBody[0], /setPendingPlace\(selectedPlace\)/);
  assert.doesNotMatch(resolveBody[0], /setPendingPlace\(\{\s*formattedAddress/);
  const profileCallback = profile.match(/const handleLocationConfirm = \([\s\S]*?\n  \};/);
  assert.ok(profileCallback);
  assert.match(profileCallback[0], /if \(place\) \{/);
  const manualCoordinatePath = profileCallback[0].split(/if \(place\) \{/)[0];
  assert.doesNotMatch(manualCoordinatePath, /setCityId\(/);
});
