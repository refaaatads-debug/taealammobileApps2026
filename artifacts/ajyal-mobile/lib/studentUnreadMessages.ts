import type { SupabaseClient } from "@supabase/supabase-js";

const BOOKING_ID_BATCH_SIZE = 40;

export async function getStudentUnreadChatMessageCount(
  client: SupabaseClient | null,
  userId: string,
  readMessageIds: ReadonlySet<string>,
): Promise<number> {
  if (!client) throw new Error("Chat inbox is unavailable.");

  const bookingsResult = await client
    .from("bookings")
    .select("id")
    .eq("student_id", userId);
  if (bookingsResult.error) throw bookingsResult.error;

  const bookingIds = [...new Set(
    (bookingsResult.data ?? [])
      .map((booking) => booking.id)
      .filter((id): id is string => typeof id === "string" && Boolean(id)),
  )];
  if (!bookingIds.length) return 0;

  let unreadCount = 0;
  for (let offset = 0; offset < bookingIds.length; offset += BOOKING_ID_BATCH_SIZE) {
    const batch = bookingIds.slice(offset, offset + BOOKING_ID_BATCH_SIZE);
    const messagesResult = await client
      .from("chat_messages")
      .select("id,sender_id")
      .in("booking_id", batch);
    if (messagesResult.error) throw messagesResult.error;

    for (const message of messagesResult.data ?? []) {
      if (
        message.sender_id !== userId &&
        typeof message.id === "string" &&
        !readMessageIds.has(message.id)
      ) {
        unreadCount += 1;
      }
    }
  }

  return unreadCount;
}