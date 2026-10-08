const {
  IOSConfig,
  withAppDelegate,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const CALLKEEP_HEADER_PATH =
  '"$(SRCROOT)/../node_modules/react-native-callkeep/ios/RNCallKeep"';
const VOIP_HEADER_PATH =
  '"$(SRCROOT)/../node_modules/react-native-voip-push-notification/ios/RNVoipPushNotification"';

function addHeaderSearchPath(project, value) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const [key, configuration] of Object.entries(configurations)) {
    if (key.endsWith("_comment")) continue;
    const settings = configuration.buildSettings;
    const productName = String(settings?.PRODUCT_NAME ?? "").replace(/^"(.*)"$/, "$1");
    if (!settings || productName !== project.productName) continue;
    const paths = settings.HEADER_SEARCH_PATHS;
    const normalized = Array.isArray(paths) ? paths : paths ? [paths] : ['"$(inherited)"'];
    if (!normalized.includes(value)) normalized.push(value);
    settings.HEADER_SEARCH_PATHS = normalized;
  }
}

function withPushKitAppDelegate(config) {
  return withAppDelegate(config, (modConfig) => {
    const { modResults } = modConfig;
    if (modResults.language !== "swift") {
      throw new Error("Ajyal native calls require an Expo Swift AppDelegate");
    }
    let contents = modResults.contents;
    if (!contents.includes("class AppDelegate: ExpoAppDelegate")) {
      throw new Error("Unable to find ExpoAppDelegate in AppDelegate.swift");
    }
    if (!contents.includes("import PushKit")) {
      contents = contents.replace(
        "import React\n",
        "import React\nimport PushKit\nimport RNCallKeep\nimport RNVoipPushNotification\n",
      );
    }
    contents = contents.replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {",
    );
    if (!contents.includes("private var ajyalVoipRegistry: PKPushRegistry?")) {
      contents = contents.replace(
        "  var window: UIWindow?\n",
        "  var window: UIWindow?\n  private var ajyalVoipRegistry: PKPushRegistry?\n",
      );
    }
    if (!contents.includes("RNCallKeep.setup([")) {
      contents = contents.replace(
        "  ) -> Bool {\n    let delegate = ReactNativeDelegate()",
        `  ) -> Bool {
    RNCallKeep.setup([
      "appName": "أجيال المعرفة",
      "supportsVideo": false,
      "maximumCallGroups": 1,
      "maximumCallsPerCallGroup": 1
    ])
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    ajyalVoipRegistry = registry
    let delegate = ReactNativeDelegate()`,
      );
    }

    const delegateEnd = "\n}\n\nclass ReactNativeDelegate";
    if (!contents.includes("func pushRegistry(")) {
      if (!contents.includes(delegateEnd)) {
        throw new Error("Unable to find the AppDelegate extension point for PushKit handlers");
      }
      contents = contents.replace(
        delegateEnd,
        `

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    RNVoipPushNotificationManager.didUpdatePushCredentials(pushCredentials, forType: type.rawValue)
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    let data = payload.dictionaryPayload
    RNVoipPushNotificationManager.didReceiveIncomingPush(withPayload: payload, forType: type.rawValue)
    guard
      data["type"] as? String == "incoming_call",
      let uuid = data["uuid"] as? String,
      let handle = data["handle"] as? String
    else {
      completion()
      return
    }
    RNCallKeep.reportNewIncomingCall(
      uuid,
      handle: handle,
      handleType: "generic",
      hasVideo: false,
      localizedCallerName: data["callerName"] as? String ?? "مكالمة واردة",
      supportsHolding: false,
      supportsDTMF: false,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: data,
      withCompletionHandler: {
        completion()
      }
    )
  }
}

class ReactNativeDelegate`,
      );
    }
    modResults.contents = contents;
    return modConfig;
  });
}

function withCallKitProject(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const target = IOSConfig.XcodeUtils.getApplicationNativeTarget({
      project,
      projectName: modConfig.modRequest.projectName,
    });
    project.addFramework("CallKit.framework", { target: target.uuid });
    addHeaderSearchPath(project, CALLKEEP_HEADER_PATH);
    addHeaderSearchPath(project, VOIP_HEADER_PATH);
    return modConfig;
  });
}

module.exports = function withAjyalNativeCalls(config) {
  const voipEnvironment =
    process.env.EXPO_PUBLIC_APNS_ENV === "sandbox" ? "sandbox" : "production";
  config.extra = {
    ...config.extra,
    apnsVoipEnvironment: voipEnvironment,
  };
  config = withInfoPlist(config, (modConfig) => {
    const modes = modConfig.modResults.UIBackgroundModes ?? [];
    for (const mode of ["voip", "remote-notification", "audio"]) {
      if (!modes.includes(mode)) modes.push(mode);
    }
    modConfig.modResults.UIBackgroundModes = modes;
    return modConfig;
  });
  config = withEntitlementsPlist(config, (modConfig) => {
    modConfig.modResults["aps-environment"] =
      voipEnvironment === "sandbox" ? "development" : "production";
    return modConfig;
  });
  return withCallKitProject(withPushKitAppDelegate(config));
};