import { supabase } from './supabase';
import { recoverSupabaseSessionAfter401 } from './authSessionRecovery';

function responseStatus(error: unknown): number | null {
  const status = Number((error as any)?.status ?? (error as any)?.context?.status);
  return Number.isFinite(status) && status > 0 ? status : null;
}

export async function invokeSessionTransportToken(bookingId: string): Promise<unknown> {
  if (!supabase) throw new Error('Supabase is not configured');

  const invoke = () => supabase.functions.invoke('session-transport-token', {
    body: { bookingId },
  });

  let { data, error } = await invoke();
  if (error && responseStatus(error) === 401) {
    if (await recoverSupabaseSessionAfter401()) {
      ({ data, error } = await invoke());
    }
  }
  if (error) throw error;
  return data;
}
