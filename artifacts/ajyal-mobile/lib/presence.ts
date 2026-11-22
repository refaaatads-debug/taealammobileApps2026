import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";

// "Online" means the app is open in the foreground right now. Each signed-in app
// tracks itself on its own channel; a chat watches the other person's channel.
const channelName = (userId: string) => `presence-user-${userId}`;

export function useOwnPresence(userId: string | null | undefined) {
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return undefined;
    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;
    const join = () => {
      if (channel || cancelled) return;
      const next = client.channel(channelName(userId), { config: { presence: { key: userId } } });
      channel = next;
      next.subscribe((status) => {
        if (status === "SUBSCRIBED") void next.track({ online_at: new Date().toISOString() }).catch(() => undefined);
      });
    };
    const leave = () => {
      if (!channel) return;
      const current = channel;
      channel = null;
      void client.removeChannel(current).catch(() => undefined);
    };
    if (AppState.currentState === "active") join();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") join();
      else leave();
    });
    return () => {
      cancelled = true;
      sub.remove();
      leave();
    };
  }, [userId]);
}

export function usePeerOnline(peerId: string | null | undefined): boolean {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const client = supabase;
    setOnline(false);
    if (!client || !peerId) return undefined;
    const channel = client.channel(channelName(peerId));
    const sync = () => {
      try {
        setOnline(Object.keys(channel.presenceState()).length > 0);
      } catch {
        setOnline(false);
      }
    };
    channel.on("presence", { event: "sync" }, sync);
    channel.subscribe();
    return () => {
      void client.removeChannel(channel).catch(() => undefined);
    };
  }, [peerId]);
  return online;
}
