import { supabase } from "./supabase";

// Apple App Review Guideline 5.1.1(v): account deletion must be startable in the app.
// Calls a server function "delete-account" that does NOT exist yet (proposal only,
// see docs/ios-compliance-server-spec.md). The app never holds service-role keys.

export type DeleteAccountResult = { ok: true } | { ok: false; message: string };

export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  if (!supabase) return { ok: false, message: "Supabase is not configured" };
  const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirm: true } });
  if (error) return { ok: false, message: error.message };
  const payload = data as { ok?: boolean; error?: string } | null;
  if (payload && payload.ok === false) return { ok: false, message: payload.error ?? "Deletion failed" };
  return { ok: true };
}
