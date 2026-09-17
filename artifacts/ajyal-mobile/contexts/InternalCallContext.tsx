import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import type * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useInternalCallWebRTC } from '@/hooks/useInternalCallWebRTC';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';
import { Icon } from '@/components/AjyalUI';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import {
  registerPushToken as registerPushTokenOnServer,
  sendCallAccepted as sendCallAcceptedNotification,
  sendCallEnded as sendCallEndedNotification,
  sendIncomingCall as sendIncomingCallNotification,
} from '@workspace/api-client-react';

export const INCOMING_CALL_CATEGORY = 'incoming-call';
export const INCOMING_CALL_TYPE = 'incoming_call';
export const CALL_ENDED_TYPE = 'call_ended';
export const CALL_ACCEPTED_TYPE = 'call_accepted';
export const ACCEPT_CALL_ACTION = 'accept-call';
export const DECLINE_CALL_ACTION = 'decline-call';
export const BACKGROUND_CALL_NOTIFICATION_TASK = 'ajyal-call-notification-task';
export const DEFAULT_NOTIFICATION_CHANNEL = 'default';
export const APP_NOTIFICATION_CHANNEL = 'app-notifications-v2';
export const MESSAGE_NOTIFICATION_CHANNEL = 'message-notifications-v2';
export const SESSION_NOTIFICATION_CHANNEL = 'session-notifications-v2';
export const APPROVAL_NOTIFICATION_CHANNEL = 'approval-notifications-v2';
const INCOMING_CALL_SOUND = require('@/assets/audio/incoming_call.wav');
const APP_NOTIFICATION_SOUND = require('@/assets/audio/message_notification.wav');
export const INCOMING_CALL_CHANNEL = 'incoming-call-v2';
const isExpoGo = Platform.OS !== 'web' && Constants.appOwnership === 'expo';

export type CallStatus = 'ringing' | 'active' | 'busy' | 'declined' | 'ended';

export type IncomingCall = {
  id: string;
  callerId?: string;
  calleeId?: string;
  callerName: string;
  callerRole?: string;
  roomId?: string;
  status: CallStatus;
};

type CallPayload = {
  type?: unknown;
  callId?: unknown;
  callerId?: unknown;
  callerName?: unknown;
  callerRole?: unknown;
  roomId?: unknown;
};

type RemoteCallRow = Record<string, unknown>;

type InternalCallContextValue = {
  call: IncomingCall | null;
  startIncomingCall: (payload: Omit<IncomingCall, 'status'>) => void;
  startOutgoingCall: (recipientId: string, roomId?: string, callId?: string) => Promise<string>;
  endOutgoingCall: (callId: string, recipientId: string) => Promise<void>;
  testIncomingCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => Promise<void>;
  clearCall: () => void;
  muted: boolean;
  callConnectionState: 'idle' | 'connecting' | 'connected' | 'failed';
  toggleMute: () => void;
  speakerEnabled: boolean;
  toggleSpeaker: () => void;
  callError: string | null;
};

const InternalCallContext = createContext<InternalCallContextValue | null>(null);

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;
let notificationsLoadPromise: Promise<NotificationsModule | null> | null = null;
let backgroundTaskDefined = false;
let appPermissionsPromise: Promise<void> | null = null;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;
  if (notificationsModule) return notificationsModule;
  if (!notificationsLoadPromise) {
    notificationsLoadPromise = import('expo-notifications')
      .then((module) => {
        notificationsModule = module;
        return module;
      })
      .catch((error) => {
        console.warn('[push] notifications_module_unavailable', {
          errorName: error instanceof Error ? error.name : 'unknown',
        });
        return null;
      });
  }
  return notificationsLoadPromise;
}

async function configureNotificationsModule(notifications: NotificationsModule): Promise<void> {
  if (!backgroundTaskDefined) {
    try {
      TaskManager.defineTask<Notifications.NotificationTaskPayload>(
        BACKGROUND_CALL_NOTIFICATION_TASK,
        async ({ data, error }) => {
          if (error) return notifications.BackgroundNotificationTaskResult.Failed;
          const payload = backgroundNotificationData(data);
          if (isEndedPayload(payload)) {
            await dismissPresentedCallNotifications(asString(payload.callId)).catch(() => undefined);
          }
          return notifications.BackgroundNotificationTaskResult.NoData;
        },
      );
      backgroundTaskDefined = true;
    } catch {
      // Fast refresh can evaluate the task definition more than once.
    }
  }

  notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data ?? {};
      const isCallEnded = isEndedPayload(data);
      return {
        // Use the native notification surface for every regular push in every
        // app state. Realtime-only events still use the in-app banner below.
        shouldShowBanner: !isCallEnded,
        shouldShowList: !isCallEnded,
        shouldPlaySound: !isCallEnded,
        shouldSetBadge: !isCallEnded,
        priority: notifications.AndroidNotificationPriority.MAX,
      };
    },
  });
  if (Platform.OS === 'android') {
    const channels = [
      {
        id: DEFAULT_NOTIFICATION_CHANNEL,
        name: 'تنبيهات أجيال المعرفة',
        description: 'الإشعارات العامة من منصة أجيال المعرفة',
        sound: 'default',
      },
      {
        id: APP_NOTIFICATION_CHANNEL,
        name: 'تنبيهات عامة',
        description: 'تحديثات الحساب والمنصة',
        sound: 'default',
      },
      {
        id: MESSAGE_NOTIFICATION_CHANNEL,
        name: 'الرسائل',
        description: 'رسائل المعلمين والطلاب',
        sound: 'message_notification.wav',
      },
      {
        id: SESSION_NOTIFICATION_CHANNEL,
        name: 'الجلسات',
        description: 'تذكيرات الجلسات وبدءها وانتهاؤها',
        sound: 'session_notification.wav',
      },
      {
        id: APPROVAL_NOTIFICATION_CHANNEL,
        name: 'الحجوزات والموافقات',
        description: 'طلبات الحجز والقبول والرفض والإلغاء',
        sound: 'approval_notification.wav',
      },
    ];
    await Promise.all(channels.map((channel) =>
      notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: notifications.AndroidImportance.HIGH,
        sound: channel.sound,
        vibrationPattern: [0, 180, 120, 180],
        enableVibrate: true,
        lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      }).catch(() => undefined),
    ));
  }
  await notifications.registerTaskAsync(BACKGROUND_CALL_NOTIFICATION_TASK).catch(() => undefined);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function parseCallPayload(data: Record<string, unknown>): IncomingCall | null {
  const payload = data as CallPayload;
  if (payload.type !== INCOMING_CALL_TYPE) return null;
  const id = asString(payload.callId);
  const callerName = asString(payload.callerName);
  if (!id || !callerName) return null;
  const rawRoomId = asString(payload.roomId);
  return {
    id,
    callerId: asString(payload.callerId),
    callerName,
    callerRole: asString(payload.callerRole),
    roomId: rawRoomId?.startsWith('call:') ? undefined : rawRoomId,
    status: 'ringing',
  };
}

function isEndedPayload(data: Record<string, unknown>): boolean {
  return data.type === CALL_ENDED_TYPE;
}

function isAcceptedPayload(data: Record<string, unknown>): boolean {
  return data.type === CALL_ACCEPTED_TYPE;
}

function remoteCallStatus(row: RemoteCallRow): CallStatus | null {
  const status = asString(row.status)?.toLowerCase();
  if (!status || status === 'ringing') return 'ringing';
  // connecting means the callee accepted. Both sides must start WebRTC now;
  // treating it as active also prevents losing the initial offer.
  if (status === 'connecting' || status === 'connected' || status === 'active') return 'active';
  if (status === 'busy') return 'busy';
  if (status === 'rejected' || status === 'declined') return 'declined';
  if (status === 'cancelled' || status === 'missed' || status === 'ended' || status === 'failed') return 'ended';
  return null;
}

function remoteIncomingCall(row: RemoteCallRow, userId: string): { call: IncomingCall; status: CallStatus } | null {
  const id = asString(row.id);
  if (!id) return null;
  const callerId = asString(row.caller_id) ?? asString(row.from_user_id);
  const calleeId = asString(row.callee_id) ?? asString(row.receiver_id) ?? asString(row.to_user_id) ?? asString(row.student_id);
  if ((!callerId && !calleeId) || (callerId !== userId && calleeId !== userId)) return null;
  const status = remoteCallStatus(row);
  if (!status) return null;
  const callerName = asString(row.caller_name) ?? asString(row.from_name) ?? 'مستخدم أجيال المعرفة';
  return {
    status,
    call: {
      id,
      callerId,
      callerName,
      callerRole: asString(row.caller_role) ?? 'معلم',
      roomId: asString(row.booking_id) ?? asString(row.room_id),
      status,
    },
  };
}

type AppNotificationRoute =
  | '/bookings'
  | '/messages'
  | '/assignments'
  | '/support'
  | '/subscription'
  | '/invoices'
  | '/profile'
  | '/notifications';

function routeForNotification(data: Record<string, unknown>): AppNotificationRoute | null {
  const explicitRoute = asString(data.route);
  if (
    explicitRoute === '/bookings'
    || explicitRoute === '/messages'
    || explicitRoute === '/assignments'
    || explicitRoute === '/support'
    || explicitRoute === '/subscription'
    || explicitRoute === '/invoices'
    || explicitRoute === '/profile'
    || explicitRoute === '/notifications'
  ) {
    return explicitRoute;
  }
  if (
    data.type === 'support_reply'
    || data.type === 'support_message'
    || data.type === 'support_ticket'
    || data.type === 'support_response'
    || data.type === 'support_ticket_reply'
    || data.type === 'ticket_reply'
  ) return '/support';
  if (data.type === 'assignment_submission' || data.type === 'assignment_graded') return '/assignments';
  if (data.type === 'payment' || data.type === 'subscription' || data.type === 'subscription_updated') return '/subscription';
  if (data.type === 'invoice') return '/invoices';
  if (data.type === 'profile' || data.type === 'rating' || data.type === 'review') return '/profile';
  if (
    data.type === 'booking_request'
    || data.type === 'booking_confirmed'
    || data.type === 'booking_accepted'
    || data.type === 'booking_rejected'
    || data.type === 'booking_cancelled'
    || data.type === 'session_reminder'
    || data.type === 'session_starting'
    || data.type === 'session_started'
    || data.type === 'session_ended'
    || data.type === 'instant_session'
    || data.type === 'expired_no_show'
    || data.type === 'no_show'
    || data.type === 'booking_expired'
    || data.type === 'session_auto_cancelled'
    || data.type === 'automatic_cancellation'
    || data.type === 'session_cancelled'
  ) return '/bookings';
  if (data.type === 'chat_message' || data.type === 'message' || data.type === 'new_message') return '/messages';
  if (
    data.type === 'teacher_cancellation_warning'
    || data.type === 'first_impression'
    || data.type === 'admin_announcement'
    || data.type === 'announcement'
    || data.type === 'system_notification'
    || data.type === 'notification'
  ) return '/notifications';
  // Unknown account notifications still belong in the in-app inbox.
  return data.type === INCOMING_CALL_TYPE || data.type === CALL_ENDED_TYPE || data.type === CALL_ACCEPTED_TYPE
    ? null
    : '/notifications';
}

function backgroundNotificationData(
  payload: Notifications.NotificationTaskPayload,
): Record<string, unknown> {
  if ('actionIdentifier' in payload) {
    return notificationData(payload);
  }

  const taskData = payload.data;
  if (typeof taskData.dataString === 'string') {
    try {
      const parsed = JSON.parse(taskData.dataString) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return taskData;
}

async function dismissPresentedCallNotifications(callId?: string): Promise<void> {
  const notifications = await getNotificationsModule();
  if (!notifications) return;
  const presented = await notifications.getPresentedNotificationsAsync();
  const matching = presented.filter((notification) => {
    const data = notification.request.content.data ?? {};
    return data.type === INCOMING_CALL_TYPE
      && (!callId || asString(data.callId) === callId);
  });
  await Promise.all(
    matching.map((notification) =>
      notifications.dismissNotificationAsync(notification.request.identifier).catch(() => undefined),
    ),
  );
}

type NotificationPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
};

async function configureCallNotifications(notifications: NotificationsModule): Promise<NotificationPermissionState | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;

  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL, {
      name: 'المكالمات الواردة',
      description: 'تنبيهات المكالمات الداخلية الواردة',
      importance: notifications.AndroidImportance.MAX,
      sound: 'incoming_call.wav',
      vibrationPattern: [0, 250, 200, 250],
      enableVibrate: true,
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => undefined);
  }

  await notifications.setNotificationCategoryAsync(
    INCOMING_CALL_CATEGORY,
    [
      {
        identifier: ACCEPT_CALL_ACTION,
        buttonTitle: 'قبول',
        options: { opensAppToForeground: true },
      },
      {
        identifier: DECLINE_CALL_ACTION,
        buttonTitle: 'رفض',
        options: { isDestructive: true, opensAppToForeground: true },
      },
    ],
    { customDismissAction: true, showTitle: true, showSubtitle: true },
  ).catch(() => undefined);

  const currentPermission = await notifications.getPermissionsAsync();
  if (
    !currentPermission.granted
    && currentPermission.status === 'denied'
    && currentPermission.canAskAgain === false
  ) {
    console.info('[push] notification_permission', {
      platform: Platform.OS,
      granted: false,
      status: currentPermission.status,
      canAskAgain: false,
    });
    return {
      granted: false,
      canAskAgain: false,
    };
  }
  const permission = currentPermission.granted
    ? currentPermission
    : await notifications.requestPermissionsAsync();
  console.info('[push] notification_permission', {
    platform: Platform.OS,
    granted: permission.granted,
    status: permission.status,
    canAskAgain: permission.canAskAgain,
  });
  return {
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
  };
}

async function requestAppPermissions(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (appPermissionsPromise) return appPermissionsPromise;

  appPermissionsPromise = (async () => {
    // Ask one permission at a time so native permission dialogs do not overlap.
    await requestRecordingPermissionsAsync().catch(() => undefined);
    await ImagePicker.requestCameraPermissionsAsync().catch(() => undefined);
    await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => undefined);
  })().catch(() => undefined);

  return appPermissionsPromise;
}

async function getDevicePushToken(notifications: NotificationsModule): Promise<string | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] expo_token_failed', {
      token_exists: false,
      projectId: null,
      reason: 'missing_project_id',
    });
  }
  try {
    const tokenResponse = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    console.info('[push] expo_token_created', {
      platform: Platform.OS,
      projectId: projectId ?? null,
      token_exists: Boolean(tokenResponse.data),
    });
    return tokenResponse.data;
  } catch (error) {
    console.warn('[push] expo_token_failed', {
      platform: Platform.OS,
      projectId: projectId ?? null,
      token_exists: false,
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

async function registerDevicePushToken(
  notifications: NotificationsModule,
  token?: string,
): Promise<string | null> {
  const resolvedToken = token ?? await getDevicePushToken(notifications);
  if (!resolvedToken) return null;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    await registerPushTokenOnServer({
      token: resolvedToken,
      platform,
    });
    console.info('[push] token_registration_succeeded', {
      platform,
      token_exists: true,
      registration: 'success',
    });
  } catch (error) {
    console.warn('[push] token_registration_failed', {
      platform,
      token_exists: true,
      registration: 'failure',
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
  return resolvedToken;
}

function notificationData(response: Notifications.NotificationResponse): Record<string, unknown> {
  return response.notification.request.content.data ?? {};
}

export async function scheduleIncomingCallNotification(call: Omit<IncomingCall, 'status'>): Promise<string | null> {
  const notifications = await getNotificationsModule();
  if (!notifications) return null;
  return notifications.scheduleNotificationAsync({
    content: {
      title: 'مكالمة واردة',
      subtitle: 'أجيال المعرفة',
      body: `${call.callerName} يتصل بك الآن`,
      data: {
        type: INCOMING_CALL_TYPE,
        callId: call.id,
        callerId: call.callerId,
        callerName: call.callerName,
        callerRole: call.callerRole,
        roomId: call.roomId,
      },
      categoryIdentifier: INCOMING_CALL_CATEGORY,
      sound: 'incoming_call.wav',
      priority: 'max',
      color: '#20B9B0',
      autoDismiss: false,
      sticky: true,
      interruptionLevel: 'timeSensitive',
    },
    trigger: { channelId: INCOMING_CALL_CHANNEL },
  });
}

export function InternalCallProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState | null>(null);
  const callRef = useRef<IncomingCall | null>(null);
  const announcedCallIdRef = useRef<string | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const notificationIdsByCall = useRef(new Map<string, Set<string>>());
  const registeredPushUserId = useRef<string | null>(null);
  const registeredPushToken = useRef<string | null>(null);
  const incomingCallPlayer = useAudioPlayer(INCOMING_CALL_SOUND);
  const appNotificationPlayer = useAudioPlayer(APP_NOTIFICATION_SOUND);
  const [foregroundNotification, setForegroundNotification] = useState<{
    id: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
  } | null>(null);
  const foregroundNotificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foregroundNotificationIds = useRef(new Set<string>());
  const foregroundNotificationFingerprints = useRef(new Map<string, number>());

  const presentForegroundNotification = useCallback((
    id: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) => {
    if (foregroundNotificationIds.current.has(id)) return;
    const fingerprint = `${title.trim()}\u0000${body.trim()}`;
    const now = Date.now();
    const fingerprintExpiresAt = foregroundNotificationFingerprints.current.get(fingerprint);
    if (fingerprintExpiresAt && fingerprintExpiresAt > now) return;
    for (const [existingFingerprint, expiresAt] of foregroundNotificationFingerprints.current) {
      if (expiresAt <= now) foregroundNotificationFingerprints.current.delete(existingFingerprint);
    }
    foregroundNotificationFingerprints.current.set(fingerprint, now + 10_000);
    foregroundNotificationIds.current.add(id);
    if (foregroundNotificationIds.current.size > 100) {
      const oldest = foregroundNotificationIds.current.values().next().value;
      if (oldest) foregroundNotificationIds.current.delete(oldest);
    }
    setForegroundNotification({ id, title, body, data });
    if (foregroundNotificationTimer.current) clearTimeout(foregroundNotificationTimer.current);
    foregroundNotificationTimer.current = setTimeout(() => {
      setForegroundNotification(null);
      foregroundNotificationTimer.current = null;
    }, 6500);
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    }).catch(() => undefined);
    appNotificationPlayer.volume = 1;
    appNotificationPlayer.play();
  }, [appNotificationPlayer]);
  const callAudio = useInternalCallWebRTC({
    call,
    userId: user?.id,
    enabled: Boolean(isAuthenticated && call?.status === 'active'),
  });

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    const ringingCall = call?.status === 'ringing' ? call : null;
    if (!ringingCall) {
      incomingCallPlayer.pause();
      void incomingCallPlayer.seekTo(0).catch(() => undefined);
      if (announcedCallIdRef.current) {
        Speech.stop().catch(() => undefined);
        announcedCallIdRef.current = null;
      }
      return;
    }

    incomingCallPlayer.loop = true;
    incomingCallPlayer.volume = 1;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
    }).catch(() => undefined);
    incomingCallPlayer.play();

    if (announcedCallIdRef.current !== ringingCall.id) {
      announcedCallIdRef.current = ringingCall.id;
      Speech.stop().catch(() => undefined);
      Speech.speak(`${ringingCall.callerName} يتصل بك الآن`, {
        language: 'ar-SA',
        rate: 0.88,
        pitch: 1,
        volume: 1,
      });
    }

    return () => {
      incomingCallPlayer.pause();
    };
  }, [call?.callerName, call?.id, call?.status, incomingCallPlayer]);

  const applyCallPayload = useCallback((data: Record<string, unknown>, status?: CallStatus) => {
    const incomingCall = parseCallPayload(data);
    if (incomingCall) {
      setCall({ ...incomingCall, status: status ?? 'ringing' });
      return incomingCall.id;
    }

    if (isEndedPayload(data)) {
      const endedCallId = asString(data.callId);
      if (callRef.current && (!endedCallId || endedCallId === callRef.current.id)) {
        setCall((current) => current ? { ...current, status: 'ended' } : null);
      }
      return null;
    }

    if (isAcceptedPayload(data)) {
      const acceptedCallId = asString(data.callId);
      if (callRef.current && acceptedCallId === callRef.current.id) {
        setCall((current) => current ? { ...current, status: 'active' } : null);
      }
    }
    return null;
  }, []);

  const notifyCallEnded = useCallback(async (currentCall: IncomingCall | null): Promise<void> => {
    const recipientId = currentCall?.calleeId ?? currentCall?.callerId;
    if (!currentCall || !recipientId || recipientId === user?.id) return;
    await sendCallEndedNotification(currentCall.id, { recipientId });
  }, [user?.id]);

  const respondToCall = useCallback(async (currentCall: IncomingCall, accepted: boolean): Promise<void> => {
    if (supabase && !currentCall.id.startsWith('test-')) {
      const { data, error } = await supabase.rpc('respond_internal_call', {
        p_call_id: currentCall.id,
        p_accept: accepted,
      });
      const result = data && typeof data === 'object' ? data as { success?: boolean; message?: string } : null;
      if (error || result?.success === false) {
        throw new Error(error?.message ?? result?.message ?? (accepted ? 'تعذر قبول المكالمة' : 'تعذر رفض المكالمة'));
      }
    }
    if (currentCall.callerId) {
      if (accepted) {
        await sendCallAcceptedNotification(currentCall.id, { recipientId: currentCall.callerId }).catch(() => undefined);
      } else {
        await notifyCallEnded(currentCall);
      }
    }
  }, [notifyCallEnded]);

  const rememberNotification = useCallback((callId: string, notificationId: string) => {
    const ids = notificationIdsByCall.current.get(callId) ?? new Set<string>();
    ids.add(notificationId);
    notificationIdsByCall.current.set(callId, ids);
  }, []);

  const dismissCallNotifications = useCallback(async (callId: string, notificationId?: string): Promise<void> => {
    if (notificationId) rememberNotification(callId, notificationId);
    const ids = notificationIdsByCall.current.get(callId) ?? new Set<string>();
    const notifications = await getNotificationsModule();
    if (!notifications) {
      notificationIdsByCall.current.delete(callId);
      return;
    }
    try {
      const presented = await notifications.getPresentedNotificationsAsync();
      presented.forEach((notification) => {
        const data = notification.request.content.data ?? {};
        if (data.type === INCOMING_CALL_TYPE && asString(data.callId) === callId) {
          ids.add(notification.request.identifier);
        }
      });
    } catch {
      // The presented-notifications API is unavailable in some Expo Go sessions.
    }
    await Promise.all(
      [...ids].map((id) => notifications.dismissNotificationAsync(id).catch(() => undefined)),
    );
    notificationIdsByCall.current.delete(callId);
  }, [rememberNotification]);

  const handleNotificationResponse = useCallback((response: Notifications.NotificationResponse, notifications: NotificationsModule) => {
    const notificationId = response.notification.request.identifier;
    if (handledResponseIds.current.has(notificationId)) return;
    handledResponseIds.current.add(notificationId);

    const data = notificationData(response);
    const action = response.actionIdentifier;
    const status = action === ACCEPT_CALL_ACTION
      ? 'active'
      : action === DECLINE_CALL_ACTION
        ? 'declined'
        : undefined;
    const parsedCall = parseCallPayload(data);
    if (parsedCall) rememberNotification(parsedCall.id, notificationId);
    applyCallPayload(data, status);
    if (parsedCall && (action === ACCEPT_CALL_ACTION || action === DECLINE_CALL_ACTION)) {
      void respondToCall(parsedCall, action === ACCEPT_CALL_ACTION).catch(() => undefined);
    }
    if (parsedCall) void dismissCallNotifications(parsedCall.id, notificationId);
    else {
      const route = routeForNotification(data);
      if (route) router.push(route);
      void notifications.dismissNotificationAsync(notificationId).catch(() => undefined);
    }
    void notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [applyCallPayload, dismissCallNotifications, rememberNotification, respondToCall]);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === 'web' || isExpoGo) return undefined;

    let mounted = true;
    let setupInFlight = false;
    let receivedSubscription: Notifications.Subscription | null = null;
    let responseSubscription: Notifications.Subscription | null = null;
    const setupNotifications = async () => {
      if (!mounted || setupInFlight) return;
      setupInFlight = true;
      try {
        await requestAppPermissions();
        const notifications = await getNotificationsModule();
        if (!notifications || !mounted) return;
        await configureNotificationsModule(notifications);
        const permissionState = await configureCallNotifications(notifications);
        setNotificationPermission(permissionState);
        // Re-read and register the Expo token even when Android notification
        // permission is currently denied. Registration is useful for
        // diagnostics and lets a later permission change use the same device
        // record; Android still will not display notifications until permission
        // is granted.
        const currentToken = await getDevicePushToken(notifications).catch(() => null);
        if (
          currentToken
          && (registeredPushUserId.current !== user?.id || registeredPushToken.current !== currentToken)
        ) {
          try {
            const registeredToken = await registerDevicePushToken(notifications, currentToken);
            registeredPushUserId.current = user?.id ?? null;
            registeredPushToken.current = registeredToken;
          } catch {
            // Push registration is retryable and must never block the app.
          }
        }

        if (!receivedSubscription) {
          receivedSubscription = notifications.addNotificationReceivedListener((notification) => {
            if (!mounted) return;
            const data = notification.request.content.data ?? {};
            const incomingCall = parseCallPayload(data);
            if (incomingCall) {
              rememberNotification(incomingCall.id, notification.request.identifier);
            }
            applyCallPayload(data);
            if (isEndedPayload(data)) {
              const endedCallId = asString(data.callId);
              if (endedCallId) void dismissCallNotifications(endedCallId);
            }
          });
        }
        if (!responseSubscription) {
          responseSubscription = notifications.addNotificationResponseReceivedListener((response) => {
            handleNotificationResponse(response, notifications);
          });
          void notifications.getLastNotificationResponseAsync().then((response) => {
            if (mounted && response) handleNotificationResponse(response, notifications);
          }).catch(() => undefined);
        }
      } catch {
        // Permission denial and missing native project configuration are non-fatal.
      } finally {
        setupInFlight = false;
      }
    };

    void setupNotifications();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void setupNotifications();
      }
    });

    return () => {
      mounted = false;
      appStateSubscription.remove();
      receivedSubscription?.remove();
      responseSubscription?.remove();
      if (foregroundNotificationTimer.current) clearTimeout(foregroundNotificationTimer.current);
    };
  }, [applyCallPayload, dismissCallNotifications, handleNotificationResponse, isAuthenticated, presentForegroundNotification, rememberNotification, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      registeredPushUserId.current = null;
      registeredPushToken.current = null;
      setNotificationPermission(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const client = supabase;
    const userId = user?.id;
    if (!isAuthenticated || !client || !userId) return undefined;

    let mounted = true;
    const applyRemoteCall = async (row: RemoteCallRow) => {
      const parsed = remoteIncomingCall(row, userId);
      if (!parsed || !mounted) return;
      let nextCall = parsed.call;
      if (nextCall.callerId) {
        const profileResult = await client
          .from('profiles')
          .select('full_name,display_name')
          .eq('user_id', nextCall.callerId)
          .maybeSingle();
        const profile = profileResult.data as { full_name?: unknown; display_name?: unknown } | null;
        const callerName = asString(profile?.full_name) ?? asString(profile?.display_name);
        if (callerName) nextCall = { ...nextCall, callerName };
      }
      if (!mounted) return;
      const currentCall = callRef.current;
      if (
        currentCall
        && currentCall.id !== nextCall.id
        && (currentCall.status === 'ringing' || currentCall.status === 'active')
      ) {
        // The RPC normally prevents this row from being created. Keep the
        // current call visible if a stale/racing Realtime row still arrives.
        return;
      }
      if (parsed.status === 'ended' || parsed.status === 'declined' || parsed.status === 'busy') {
        if (callRef.current?.id === nextCall.id) {
          setCall((current) => current ? { ...current, status: parsed.status } : null);
          void dismissCallNotifications(nextCall.id);
        }
        return;
      }
      setCall({ ...nextCall, status: parsed.status });
    };

    const channel = client
      .channel(`internal-calls-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_calls' }, (payload) => {
        void applyRemoteCall((payload.new ?? payload.old) as RemoteCallRow);
      })
      .subscribe();

    void client
      .from('internal_calls')
      .select('*')
      .or(`callee_id.eq.${userId},caller_id.eq.${userId}`)
      .in('status', ['ringing', 'connecting', 'connected', 'rejected', 'busy', 'cancelled', 'missed', 'ended', 'failed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : null;
        if (row) void applyRemoteCall(row as RemoteCallRow);
      }, () => undefined);

    return () => {
      mounted = false;
      void client.removeChannel(channel);
    };
  }, [dismissCallNotifications, isAuthenticated, user?.id]);

  useEffect(() => {
    const client = supabase;
    const userId = user?.id;
    if (!isAuthenticated || !client || !userId) return undefined;

    // This covers notifications created directly by the platform/admin UI.
    // Push remains the background delivery path; Realtime gives foreground
    // users the same banner even when that producer does not call the API.
    const channel = client
      .channel(`mobile-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            id?: unknown;
            title?: unknown;
            body?: unknown;
            type?: unknown;
          };
          const id = asString(row.id) ?? `notification-${Date.now()}`;
          presentForegroundNotification(
            id,
            asString(row.title) ?? 'إشعار جديد',
            asString(row.body) ?? 'لديك تحديث جديد من منصة أجيال المعرفة.',
            { type: asString(row.type) ?? 'notification', notificationId: id },
          );
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [isAuthenticated, presentForegroundNotification, user?.id]);

  const startIncomingCall = useCallback((payload: Omit<IncomingCall, 'status'>) => {
    setCall({ ...payload, status: 'ringing' });
  }, []);

  const startOutgoingCall = useCallback(async (recipientId: string, roomId?: string, callId?: string): Promise<string> => {
    let resolvedCallId = callId;
    if (supabase && !callId) {
      const { data, error } = await supabase.rpc('start_internal_call', {
        p_student_id: recipientId,
        p_booking_id: roomId?.trim() || null,
      });
      if (error) throw new Error(error.message);
      const remote = data && typeof data === 'object' ? data as { call?: { id?: unknown }; id?: unknown; success?: boolean; message?: string } : null;
      if (remote?.success === false) throw new Error(remote.message ?? 'تعذر بدء المكالمة');
      resolvedCallId = asString(remote?.call?.id) ?? asString(remote?.id);
      if (!resolvedCallId) throw new Error('لم تصل هوية المكالمة من المنصة');
    }
    if (!resolvedCallId) throw new Error('لم تصل هوية المكالمة من المنصة');
    const deliveryRoomId = roomId?.trim() || `call:${resolvedCallId}`;
    setCall({
      id: resolvedCallId,
      callerId: user?.id,
      calleeId: recipientId,
      callerName: user?.email ?? 'أجيال المعرفة',
      callerRole: 'معلم',
      roomId: deliveryRoomId,
      // The caller must wait for the callee's acceptance before opening
      // WebRTC; otherwise the initial offer can be sent before the callee
      // subscribes and the call has no audio.
      status: 'ringing',
    });
    try {
      const result = await sendIncomingCallNotification({
        recipientId,
        roomId: deliveryRoomId,
        callId: resolvedCallId,
      });
      return result.callId;
    } catch (error) {
      // Realtime/internal_calls is authoritative for foreground clients.
      // A missing push token or a transient push outage must not cancel a
      // call that was already created in Supabase.
      console.warn('تعذر إرسال إشعار المكالمة، ستستمر عبر الاتصال الفوري:', error);
      return resolvedCallId;
    }
  }, [user?.email, user?.id]);

  const endOutgoingCall = useCallback(async (callId: string, recipientId: string): Promise<void> => {
    await sendCallEndedNotification(callId, { recipientId });
  }, []);

  const testIncomingCall = useCallback(async () => {
    const testCall = {
      id: `test-${Date.now()}`,
      callerName: 'الأستاذة سارة',
      callerRole: 'معلمة',
      roomId: 'test-room',
    };
    startIncomingCall(testCall);
    const notificationId = await scheduleIncomingCallNotification(testCall);
    if (notificationId) rememberNotification(testCall.id, notificationId);
  }, [rememberNotification, startIncomingCall]);

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    await respondToCall(current, true);
    void dismissCallNotifications(current.id);
    setCall({ ...current, status: 'active' });
  }, [dismissCallNotifications, respondToCall]);

  const declineCall = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    void respondToCall(current, false).catch(() => undefined);
    void dismissCallNotifications(current.id);
    setCall({ ...current, status: 'declined' });
  }, [dismissCallNotifications, respondToCall]);

  const endCall = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    if (supabase && !current.id.startsWith('test-')) {
      const { error } = await supabase.rpc('end_internal_call', { p_call_id: current.id, p_reason: 'participant_ended' });
      if (error) throw new Error(error.message);
    }
    await notifyCallEnded(current).catch(() => undefined);
    void dismissCallNotifications(current.id);
    setCall({ ...current, status: 'ended' });
  }, [dismissCallNotifications, notifyCallEnded]);

  const clearCall = useCallback(() => {
    setCall(null);
  }, []);

  const value = useMemo<InternalCallContextValue>(() => ({
    call,
    startIncomingCall,
    startOutgoingCall,
    endOutgoingCall,
    testIncomingCall,
    acceptCall,
    declineCall,
    endCall,
    clearCall,
    muted: callAudio.muted,
    callConnectionState: callAudio.connectionState,
    toggleMute: callAudio.toggleMute,
    speakerEnabled: callAudio.speakerEnabled,
    toggleSpeaker: callAudio.toggleSpeaker,
    callError: callAudio.error,
  }), [acceptCall, call, callAudio.connectionState, callAudio.error, callAudio.muted, callAudio.speakerEnabled, callAudio.toggleMute, callAudio.toggleSpeaker, clearCall, declineCall, endCall, endOutgoingCall, startIncomingCall, startOutgoingCall, testIncomingCall]);

  const bannerRoute = foregroundNotification ? routeForNotification(foregroundNotification.data) : null;
  return (
    <InternalCallContext.Provider value={value}>
      {children}
      {notificationPermission && !notificationPermission.granted ? (
        <NotificationPermissionBanner
          canAskAgain={notificationPermission.canAskAgain}
          onOpenSettings={() => {
            void Linking.openSettings().catch(() => undefined);
          }}
        />
      ) : null}
      {foregroundNotification ? (
        <ForegroundNotificationBanner
          title={foregroundNotification.title}
          body={foregroundNotification.body}
          onPress={() => {
            setForegroundNotification(null);
            if (bannerRoute) router.push(bannerRoute);
          }}
          onClose={() => setForegroundNotification(null)}
        />
      ) : null}
    </InternalCallContext.Provider>
  );
}

function ForegroundNotificationBanner({
  title,
  body,
  onPress,
  onClose,
}: {
  title: string;
  body: string;
  onPress: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={bannerStyles.layer}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          bannerStyles.card,
          {
            marginTop: insets.top + 8,
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.primary,
          },
          pressed && bannerStyles.pressed,
        ]}
      >
        <View style={[bannerStyles.icon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="bell" size={18} color={colors.teal} />
        </View>
        <View style={bannerStyles.copy}>
          <Text numberOfLines={1} style={[bannerStyles.title, { color: colors.foreground, writingDirection: direction }]}>{title}</Text>
          <Text numberOfLines={2} style={[bannerStyles.body, { color: colors.mutedForeground, writingDirection: direction }]}>{body}</Text>
        </View>
        <Pressable accessibilityLabel="إغلاق الإشعار" onPress={onClose} hitSlop={10} style={bannerStyles.close}>
          <Icon name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function NotificationPermissionBanner({
  canAskAgain,
  onOpenSettings,
}: {
  canAskAgain: boolean;
  onOpenSettings: () => void;
}) {
  const colors = useColors();
  const { direction, t } = useAppPreferences();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={bannerStyles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('فتح إعدادات الإشعارات', 'Open notification settings')}
        onPress={onOpenSettings}
        style={({ pressed }) => [
          bannerStyles.card,
          {
            marginTop: insets.top + 8,
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.primary,
          },
          pressed && bannerStyles.pressed,
        ]}
      >
        <View style={[bannerStyles.icon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="bell-off" size={18} color={colors.teal} />
        </View>
        <View style={bannerStyles.copy}>
          <Text style={[bannerStyles.title, { color: colors.foreground, writingDirection: direction }]}>
            {t('الإشعارات غير مفعلة', 'Notifications are disabled')}
          </Text>
          <Text numberOfLines={2} style={[bannerStyles.body, { color: colors.mutedForeground, writingDirection: direction }]}>
            {canAskAgain
              ? t('فعّلها لتصلك الرسائل وتحديثات الحجوزات والجلسات.', 'Enable them to receive messages, booking updates, and session reminders.')
              : t('افتح إعدادات الجهاز للسماح بإشعارات أجيال المعرفة.', 'Open device settings to allow Ajyal notifications.')}
          </Text>
        </View>
        <Icon name="chevron-left" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000 },
  card: {
    marginHorizontal: 12,
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, alignItems: 'flex-end' },
  title: { width: '100%', textAlign: 'right', fontSize: 12, fontFamily: 'Inter_700Bold' },
  body: { width: '100%', textAlign: 'right', fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'Inter_400Regular' },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.78 },
});

export function useInternalCall(): InternalCallContextValue {
  const context = useContext(InternalCallContext);
  if (!context) throw new Error('useInternalCall must be used inside InternalCallProvider');
  return context;
}