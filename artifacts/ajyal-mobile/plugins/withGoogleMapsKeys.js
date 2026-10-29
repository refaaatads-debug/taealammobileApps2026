module.exports = function withGoogleMapsKeys(config) {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY?.trim();
  const existingExtra = config.extra ?? {};

  if (androidKey || iosKey) {
    config.extra = {
      ...existingExtra,
      googleMapsApiKeys: {
        ...existingExtra.googleMapsApiKeys,
        ...(androidKey ? { android: androidKey } : {}),
        ...(iosKey ? { ios: iosKey } : {}),
      },
    };
  }

  if (androidKey) {
    config.android = {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: androidKey,
        },
      },
    };
  }

  if (iosKey) {
    config.ios = {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: iosKey,
      },
    };
  }

  return config;
};
