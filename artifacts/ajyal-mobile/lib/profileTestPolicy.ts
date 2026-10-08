export function isProfileUiTestMode(
  isDevelopment: boolean,
  platform: string,
  configuredMode: string | undefined,
): boolean {
  return isDevelopment && platform === "web" && configuredMode === "true";
}

export function getProfileTestRedirectTarget(testMode: boolean): "/" | null {
  return testMode ? null : "/";
}