const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const withIncomingCallNative = require("../withIncomingCallNative");
const projectRoot = path.resolve(__dirname, "../..");
const nativeServiceTemplatePath = path.join(
  projectRoot,
  "plugins",
  "templates",
  "IncomingCallMessagingService.kt",
);
const notificationsGradlePath = path.join(
  projectRoot,
  "node_modules",
  "expo-notifications",
  "android",
  "build.gradle",
);
const notificationsGradle = fs.readFileSync(notificationsGradlePath, "utf8");
const declaredVersions = [
  ...new Set(
    [...notificationsGradle.matchAll(/['"]com\.google\.firebase:firebase-messaging:([^'"]+)['"]/g)]
      .map((match) => match[1]),
  ),
];

assert.equal(
  declaredVersions.length,
  1,
  "expo-notifications must declare exactly one Firebase Messaging version",
);

const expectedVersion = declaredVersions[0];
const dependencyCoordinate = "com.google.firebase:firebase-messaging";

test("incoming-call services forward messages to Expo Notifications", () => {
  const source = fs.readFileSync(nativeServiceTemplatePath, "utf8");
  assert.match(source, /class IncomingCallMessagingService : ExpoFirebaseMessagingService\(\)/);
  assert.match(source, /super\.onMessageReceived\(message\)/);
});

async function applyPlugin(contents) {
  const config = withIncomingCallNative({ name: "ajyal-test", mods: {} });
  const appBuildGradleMod = config.mods.android.appBuildGradle;
  assert.equal(typeof appBuildGradleMod, "function");

  const result = await appBuildGradleMod({
    modRequest: { projectRoot },
    modResults: { contents },
  });
  return result.modResults.contents;
}

function assertSingleExpectedDependency(contents) {
  const declarations = contents.match(/com\.google\.firebase:firebase-messaging/g) ?? [];
  assert.equal(declarations.length, 1, "the app Gradle file should contain one declaration");
  assert.ok(
    contents.includes(`implementation("${dependencyCoordinate}:${expectedVersion}")`),
    `the app Gradle dependency should use expo-notifications version ${expectedVersion}`,
  );
}

test("adds Firebase Messaging when the app Gradle file has no declaration", async () => {
  const result = await applyPlugin("dependencies {\n}\n");

  assertSingleExpectedDependency(result);
});

test("replaces an outdated Firebase Messaging version", async () => {
  const input =
    'dependencies {\n    implementation("com.google.firebase:firebase-messaging:24.1.0")\n}\n';
  const result = await applyPlugin(input);

  assertSingleExpectedDependency(result);
  assert.doesNotMatch(result, /firebase-messaging:24\.1\.0/);
});

test("deduplicates conflicting declarations and remains idempotent", async () => {
  const input = [
    "dependencies {",
    "    implementation 'com.google.firebase:firebase-messaging:24.1.0'",
    '    api("com.google.firebase:firebase-messaging:23.0.0")',
    "}",
    "",
  ].join("\n");
  const firstPass = await applyPlugin(input);
  const secondPass = await applyPlugin(firstPass);

  assertSingleExpectedDependency(firstPass);
  assertSingleExpectedDependency(secondPass);
  assert.equal(secondPass, firstPass, "reapplying the plugin should not change the Gradle file");
});