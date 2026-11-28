import { supabase } from "./supabase";

// Apple App Review Guideline 1.2: user-generated content needs a way to
// report content and block abusive users.
// These helpers use two tables that do NOT exist yet (proposal only, see
// docs/ios-compliance-server-spec.md): chat_reports and user_blocks.

export type ReportReason = "abuse" | "spam" | "inappropriate" | "other";

export async function loadBlockedUserIds(userId: string): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId);
  if (error || !data) return new Set();
  return new Set(data.map((row) => String((row as { blocked_id: string }).blocked_id)));
}

export async function blockUser(userId: string, blockedId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  if (userId === blockedId) throw new Error("Cannot block yourself");
  const { error } = await supabase.from("user_blocks").upsert(
    { blocker_id: userId, blocked_id: blockedId },
    { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function unblockUser(userId: string, blockedId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedId);
  if (error) throw new Error(error.message);
}

export async function reportMessage(input: {
  reporterId: string;
  reportedUserId: string;
  messageId: string | null;
  bookingId: string | null;
  reason: ReportReason;
}): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("chat_reports").insert({
    reporter_id: input.reporterId,
    reported_user_id: input.reportedUserId,
    message_id: input.messageId,
    booking_id: input.bookingId,
    reason: input.reason,
  });
  if (error) throw new Error(error.message);
}
