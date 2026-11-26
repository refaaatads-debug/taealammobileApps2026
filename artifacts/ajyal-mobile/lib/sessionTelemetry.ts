import { supabase } from './supabase';

type SessionTelemetryEvent = {
  userId?: string | null;
  bookingId?: string | null;
  eventType: string;
  deviceId?: string | null;
  metadata?: Record<string, unknown>;
};

// Best-effort session telemetry, mirroring the web client's session_events
// inserts (see useSessionAntiCheat on web). Never throws: diagnostics must
// not break a live session.
export async function logSessionEvent({
  userId,
  bookingId,
  eventType,
  deviceId,
  metadata,
}: SessionTelemetryEvent): Promise<void> {
  if (!supabase || !userId) return;
  try {
    const { error } = await supabase.from('session_events').insert({
      user_id: userId,
      booking_id: bookingId ?? null,
      event_type: eventType,
      device_id: deviceId ?? null,
      metadata: metadata ?? {},
    });
    if (error) console.warn('تعذر تسجيل حدث الحصة:', error.message);
  } catch (reason) {
    console.warn('تعذر تسجيل حدث الحصة:', reason);
  }
}
