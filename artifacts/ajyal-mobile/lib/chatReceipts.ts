import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type MessageLike = { id?: unknown; sender_id?: unknown };

// Server read receipts live in public.chat_message_reads. If that table does not
// exist yet (migration not applied) or any call fails, receipts switch off for the
// session and own messages keep showing a single check. Nothing here can throw
// into the chat screen.
let receiptsUnavailable = false;

function markUnavailable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return;
  // 42P01 undefined table, PGRST205 table not in schema cache, 42501 no permission.
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42501" || /does not exist|schema cache|permission denied/i.test(error.message ?? "")) {
    receiptsUnavailable = true;
  }
}

/**
 * Returns the ids of the user's own messages that the other person has read, and
 * records the user's own reads of incoming messages.
 */
export function useChatReceipts(userId: string, messages: MessageLike[]): Set<string> {
  const [readByPeer, setReadByPeer] = useState<Set<string>>(new Set());
  const reportedRef = useRef<Set<string>>(new Set());
  const ownIds = messages.filter((m) => String(m.sender_id) === userId).map((m) => String(m.id)).filter(Boolean);
  const incomingIds = messages.filter((m) => String(m.sender_id) !== userId).map((m) => String(m.id)).filter(Boolean);
  const ownKey = ownIds.join(",");
  const incomingKey = incomingIds.join(",");

  // Record that this user has seen the incoming messages (once per id).
  useEffect(() => {
    const client = supabase;
    if (!client || receiptsUnavailable || !userId) return;
    const fresh = incomingIds.filter((id) => !reportedRef.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => reportedRef.current.add(id));
    void (async () => {
      try {
        const { error } = await client
          .from("chat_message_reads")
          .upsert(fresh.map((id) => ({ message_id: id, reader_id: userId })), { onConflict: "message_id,reader_id", ignoreDuplicates: true });
        if (error) {
          markUnavailable(error);
          fresh.forEach((id) => reportedRef.current.delete(id));
        }
      } catch {
        fresh.forEach((id) => reportedRef.current.delete(id));
      }
    })();
  }, [incomingKey, userId]);

  // Load who has read my messages, and listen for new reads.
  useEffect(() => {
    const client = supabase;
    if (!client || receiptsUnavailable || !userId || !ownIds.length) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await client
          .from("chat_message_reads")
          .select("message_id")
          .in("message_id", ownIds.slice(-200))
          .neq("reader_id", userId);
        if (error) {
          markUnavailable(error);
          return;
        }
        if (cancelled) return;
        setReadByPeer((current) => {
          const next = new Set(current);
          for (const row of data ?? []) next.add(String((row as { message_id: unknown }).message_id));
          return next;
        });
      } catch {
        /* receipts are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownKey, userId]);

  useEffect(() => {
    const client = supabase;
    if (!client || receiptsUnavailable || !userId) return undefined;
    const channel = client.channel(`chat-reads-${userId}-${Date.now()}`);
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_message_reads" }, (payload) => {
      const row = payload.new as { message_id?: unknown; reader_id?: unknown };
      if (typeof row.message_id !== "string" || row.reader_id === userId) return;
      setReadByPeer((current) => (current.has(row.message_id as string) ? current : new Set(current).add(row.message_id as string)));
    });
    channel.subscribe();
    return () => {
      void client.removeChannel(channel).catch(() => undefined);
    };
  }, [userId]);

  return readByPeer;
}
