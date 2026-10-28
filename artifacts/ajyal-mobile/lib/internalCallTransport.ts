export type InternalCallProvider = 'agora' | 'webrtc';

export type InternalCallTransportInfo = {
  transportProvider?: InternalCallProvider;
  callerAgoraCapable?: boolean;
};

export type InternalCallAgoraTransport = {
  provider: 'agora';
  appId: string;
  channel: string;
  userAccount: string;
  token: string;
  expiresAt: number;
};

export function chooseInternalCallProvider(call: InternalCallTransportInfo): InternalCallProvider {
  if (call.transportProvider === 'agora' || call.callerAgoraCapable === true) return 'agora';
  return 'webrtc';
}

export function parseInternalCallTransport(value: unknown, userId: string): InternalCallAgoraTransport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ردّ مزوّد المكالمة غير صالح.');
  }
  const response = value as Record<string, unknown>;
  if (
    response.provider !== 'agora'
    || typeof response.appId !== 'string' || !response.appId
    || typeof response.channel !== 'string' || !response.channel
    || response.userAccount !== userId
    || typeof response.token !== 'string' || !response.token
    || typeof response.expiresAt !== 'number'
    || !Number.isFinite(response.expiresAt)
    || response.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('ردّ رمز مكالمة Agora ناقص أو لا يخص الحساب الحالي.');
  }
  return {
    provider: 'agora',
    appId: response.appId,
    channel: response.channel,
    userAccount: response.userAccount,
    token: response.token,
    expiresAt: response.expiresAt,
  };
}
