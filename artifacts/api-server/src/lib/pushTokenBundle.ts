export type ApnsVoipEnvironment = "production" | "sandbox";

export type PushTokenBundle = {
  expoToken: string;
  apnsVoipToken?: string;
  apnsVoipEnvironment?: ApnsVoipEnvironment;
};

const PREFIX = "push:v1:";
const APNS_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const EXPO_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[^\]]+\]$/;

function isExpoPushToken(value: string): boolean {
  return EXPO_TOKEN_PATTERN.test(value);
}

export function isApnsVoipToken(value: string): boolean {
  return APNS_TOKEN_PATTERN.test(value);
}

export function encodePushTokenBundle(bundle: PushTokenBundle): string {
  if (!isExpoPushToken(bundle.expoToken)) throw new Error("Invalid Expo push token");
  const hasToken = Boolean(bundle.apnsVoipToken);
  if (hasToken !== Boolean(bundle.apnsVoipEnvironment)) {
    throw new Error("APNs VoIP token and environment must be supplied together");
  }
  if (bundle.apnsVoipToken && !isApnsVoipToken(bundle.apnsVoipToken)) {
    throw new Error("Invalid APNs VoIP token");
  }
  const value = JSON.stringify({
    expo: bundle.expoToken,
    ...(bundle.apnsVoipToken
      ? { voip: { token: bundle.apnsVoipToken.toLowerCase(), environment: bundle.apnsVoipEnvironment } }
      : {}),
  });
  const encoded = `${PREFIX}${Buffer.from(value, "utf8").toString("base64url")}`;
  if (encoded.length > 512) throw new Error("Push token bundle is too long");
  return encoded;
}

export function decodePushTokenBundle(value: string): PushTokenBundle | null {
  if (isExpoPushToken(value)) return { expoToken: value };
  if (!value.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(PREFIX.length), "base64url").toString("utf8")) as {
      expo?: unknown;
      voip?: { token?: unknown; environment?: unknown };
    };
    if (typeof parsed.expo !== "string" || !isExpoPushToken(parsed.expo)) return null;
    if (!parsed.voip) return { expoToken: parsed.expo };
    if (
      typeof parsed.voip.token !== "string"
      || !isApnsVoipToken(parsed.voip.token)
      || (parsed.voip.environment !== "production" && parsed.voip.environment !== "sandbox")
    ) return null;
    return {
      expoToken: parsed.expo,
      apnsVoipToken: parsed.voip.token.toLowerCase(),
      apnsVoipEnvironment: parsed.voip.environment,
    };
  } catch {
    return null;
  }
}

export function mergePushTokenBundle(
  existingValue: string | null,
  registration: PushTokenBundle,
): string {
  const existing = existingValue ? decodePushTokenBundle(existingValue) : null;
  const retainVoipToken = existing?.expoToken === registration.expoToken
    && !registration.apnsVoipToken
    && Boolean(existing.apnsVoipToken && existing.apnsVoipEnvironment);
  return encodePushTokenBundle({
    ...registration,
    ...(retainVoipToken
      ? {
          apnsVoipToken: existing.apnsVoipToken,
          apnsVoipEnvironment: existing.apnsVoipEnvironment,
        }
      : {}),
  });
}