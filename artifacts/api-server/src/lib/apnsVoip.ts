import crypto from "node:crypto";
import http2 from "node:http2";
import { isApnsVoipToken, type ApnsVoipEnvironment } from "./pushTokenBundle";

type ApnsVoipPayload =
  | {
      aps: { "content-available": 1 };
      type: "incoming_call";
      callId: string;
      callUuid: string;
      uuid: string;
      handle: string;
      callerId: string;
      callerName: string;
      callerRole: string;
      roomId: string;
    }
  | {
      aps: { "content-available": 1 };
      type: "call_ended";
      callId: string;
      uuid: string;
    };

type ApnsTransport = (
  token: string,
  environment: ApnsVoipEnvironment,
  payload: ApnsVoipPayload,
  jwt: string,
  topic: string,
) => Promise<void>;

function createApnsJwt(keyId: string, teamId: string, privateKey: string, now = Math.floor(Date.now() / 1000)): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${body}`), {
    key: privateKey.replace(/\\n/g, "\n"),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${body}.${signature}`;
}

async function sendHttp2(
  token: string,
  environment: ApnsVoipEnvironment,
  payload: ApnsVoipPayload,
  jwt: string,
  topic: string,
): Promise<void> {
  const authority = environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  await new Promise<void>((resolve, reject) => {
    const client = http2.connect(authority);
    let responseBody = "";
    let responseStatus = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      client.close();
      if (error) reject(error);
      else resolve();
    };
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    request.setTimeout(8_000, () => request.destroy(new Error("APNs VoIP request timed out")));
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { responseBody += chunk; });
    request.on("response", (headers) => {
      responseStatus = Number(headers[":status"] ?? 0);
    });
    request.on("end", () => {
      if (responseStatus >= 200 && responseStatus < 300) finish();
      else finish(new Error(`APNs rejected VoIP push (${responseStatus}): ${responseBody.slice(0, 200)}`));
    });
    request.on("error", (error) => finish(error));
    client.on("error", (error) => finish(error));
    request.end(JSON.stringify(payload));
  });
}

export function apnsVoipConfig(): { keyId: string; teamId: string; privateKey: string; bundleId: string } | null {
  const keyId = process.env.APNS_VOIP_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = process.env.APNS_VOIP_PRIVATE_KEY?.trim();
  const bundleId = process.env.APNS_VOIP_BUNDLE_ID?.trim();
  return keyId && teamId && privateKey && bundleId ? { keyId, teamId, privateKey, bundleId } : null;
}

export async function sendApnsVoipPush(
  token: string,
  environment: ApnsVoipEnvironment,
  payload: ApnsVoipPayload,
  transport: ApnsTransport = sendHttp2,
): Promise<void> {
  if (!isApnsVoipToken(token)) throw new Error("Invalid APNs VoIP token");
  const config = apnsVoipConfig();
  if (!config) throw new Error("APNs VoIP configuration is missing");
  const jwt = createApnsJwt(config.keyId, config.teamId, config.privateKey);
  await transport(token, environment, payload, jwt, `${config.bundleId}.voip`);
}

export const __testing = { createApnsJwt };