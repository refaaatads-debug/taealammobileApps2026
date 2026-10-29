export type AgoraTransport = {
  provider: 'agora';
  appId: string;
  channel: string;
  uid: string;
  token: string;
  expiresAt: number;
};

export type WebRtcTransport = {
  provider: 'webrtc';
  legacyActive: true;
};

export type SessionTransport = AgoraTransport | WebRtcTransport;

export function parseSessionTransport(value: unknown): SessionTransport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ردّ مزوّد الاتصال غير صالح.');
  }

  const response = value as Record<string, unknown>;
  if (
    response.provider === 'webrtc'
    && response.legacyActive === true
  ) {
    return { provider: 'webrtc', legacyActive: true };
  }

  if (
    response.provider === 'agora'
    && typeof response.appId === 'string'
    && response.appId.length > 0
    && typeof response.channel === 'string'
    && response.channel.length > 0
    && typeof response.uid === 'string'
    && response.uid.length > 0
    && typeof response.token === 'string'
    && response.token.length > 0
    && typeof response.expiresAt === 'number'
    && Number.isFinite(response.expiresAt)
    && response.expiresAt > 0
  ) {
    return {
      provider: 'agora',
      appId: response.appId,
      channel: response.channel,
      uid: response.uid,
      token: response.token,
      expiresAt: response.expiresAt,
    };
  }

  throw new Error('ردّ مزوّد الاتصال ناقص أو غير مدعوم.');
}
