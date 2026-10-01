const fs = require("node:fs");
const path = require("node:path");
const {
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const INCOMING_CALL_ACTIVITY = ".IncomingCallActivity";
const INCOMING_CALL_SERVICE = ".IncomingCallMessagingService";
const INCOMING_CALL_THEME = "@style/Theme.App.IncomingCall";

function ensurePermission(manifest, name) {
  const permissions = manifest["uses-permission"] ?? [];
  if (!permissions.some((permission) => permission.$?.["android:name"] === name)) {
    permissions.push({ $: { "android:name": name } });
  }
  manifest["uses-permission"] = permissions;
}

function ensureIncomingActivity(application) {
  const activities = application.activity ?? [];
  const existing = activities.find(
    (activity) => activity.$?.["android:name"] === INCOMING_CALL_ACTIVITY,
  );
  const attributes = {
    "android:name": INCOMING_CALL_ACTIVITY,
    "android:excludeFromRecents": "true",
    "android:exported": "false",
    "android:launchMode": "singleTop",
    "android:showWhenLocked": "true",
    "android:turnScreenOn": "true",
    "android:theme": INCOMING_CALL_THEME,
  };
  if (existing) {
    existing.$ = { ...existing.$, ...attributes };
  } else {
    activities.push({ $: attributes });
  }
  application.activity = activities;
}

function ensureMessagingService(application) {
  const services = application.service ?? [];
  const existing = services.find(
    (service) => service.$?.["android:name"] === INCOMING_CALL_SERVICE,
  );
  const service = existing ?? {
    $: {
      "android:name": INCOMING_CALL_SERVICE,
      "android:exported": "false",
    },
    "intent-filter": [],
  };
  service.$ = { ...service.$, "android:name": INCOMING_CALL_SERVICE, "android:exported": "false" };
  const filters = service["intent-filter"] ?? [];
  if (
    !filters.some((filter) =>
      (filter.action ?? []).some(
        (action) => action.$?.["android:name"] === "com.google.firebase.MESSAGING_EVENT",
      ),
    )
  ) {
    filters.push({
      action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }],
    });
  }
  service["intent-filter"] = filters;
  if (!existing) services.push(service);
  application.service = services;
}

function withIncomingCallManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const manifestAttributes = manifest.$ ?? {};
    manifestAttributes["xmlns:tools"] = "http://schemas.android.com/tools";
    manifest.$ = manifestAttributes;
    ensurePermission(manifest, "android.permission.POST_NOTIFICATIONS");
    ensurePermission(manifest, "android.permission.USE_FULL_SCREEN_INTENT");
    const application = manifest.application?.[0];
    if (!application) {
      throw new Error("withIncomingCallNative requires an Android application entry");
    }
    const services = application.service ?? [];
    const expoMessagingServiceName = "expo.modules.notifications.service.ExpoFirebaseMessagingService";
    const expoMessagingServiceIndex = services.findIndex(
      (service) => service.$?.["android:name"] === expoMessagingServiceName,
    );
    if (expoMessagingServiceIndex !== -1) services.splice(expoMessagingServiceIndex, 1);
    if (!services.some(
      (service) => service.$?.["android:name"] === expoMessagingServiceName
        && service.$?.["tools:node"] === "remove",
    )) {
      services.push({
        $: {
          "android:name": expoMessagingServiceName,
          "tools:node": "remove",
        },
      });
    }
    application.service = services;
    ensureIncomingActivity(application);
    ensureMessagingService(application);
    return modConfig;
  });
}

function withIncomingCallSources(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const androidRoot = path.join(modConfig.modRequest.platformProjectRoot);
      const packageName =
        modConfig.android?.package ??
        modConfig.android?.namespace ??
        "com.ajyalalmaerifa.app";
      const packagePath = packageName.split(".").join(path.sep);
      const sourceDir = path.join(
        androidRoot,
        "app",
        "src",
        "main",
        "java",
        packagePath,
      );
      const valuesDir = path.join(androidRoot, "app", "src", "main", "res", "values");
      const rawDir = path.join(androidRoot, "app", "src", "main", "res", "raw");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.mkdirSync(rawDir, { recursive: true });

      const templateDir = path.join(modConfig.modRequest.projectRoot, "plugins", "templates");
      const replacePackage = (content) =>
        content.replaceAll("com.ajyalalmaerifa.app", packageName);
      for (const fileName of ["IncomingCallActivity.kt", "IncomingCallMessagingService.kt"]) {
        const source = fs.readFileSync(path.join(templateDir, fileName), "utf8");
        fs.writeFileSync(path.join(sourceDir, fileName), replacePackage(source));
      }
      fs.copyFileSync(
        path.join(templateDir, "incoming_call_styles.xml"),
        path.join(valuesDir, "incoming_call_styles.xml"),
      );
      fs.copyFileSync(
        path.join(modConfig.modRequest.projectRoot, "assets", "audio", "incoming_call.wav"),
        path.join(rawDir, "incoming_call.wav"),
      );
      return modConfig;
    },
  ]);
}

module.exports = function withIncomingCallNative(config) {
  return withIncomingCallSources(withIncomingCallManifest(config));
};