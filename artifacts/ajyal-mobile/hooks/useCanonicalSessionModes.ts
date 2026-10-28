import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@/constants/localData";
import { supabase } from "@/lib/supabase";
import { resolveSessionDeliveryMode } from "@/lib/sessionDeliveryMode";

type BookingModeRow = {
  id: string;
  delivery_mode: unknown;
};

export function useCanonicalSessionModes(sessions: Session[], userId?: string | null): Session[] {
  const sessionIds = useMemo(
    () => [...new Set(sessions.map((session) => session.id).filter(Boolean))].sort(),
    [sessions],
  );
  const modesQuery = useQuery({
    queryKey: ["canonical-booking-modes", userId, sessionIds.join(",")],
    enabled: Boolean(supabase && userId && sessionIds.length),
    staleTime: 30_000,
    queryFn: async (): Promise<BookingModeRow[]> => {
      if (!supabase || !sessionIds.length) return [];
      const rows: BookingModeRow[] = [];
      for (let index = 0; index < sessionIds.length; index += 40) {
        const { data, error } = await supabase
          .from("bookings" as any)
          .select("id,delivery_mode")
          .in("id", sessionIds.slice(index, index + 40));
        if (error) throw error;
        if (Array.isArray(data)) rows.push(...data as BookingModeRow[]);
      }
      return rows;
    },
  });
  const modesById = useMemo(
    () => new Map((modesQuery.data ?? []).map((row) => [String(row.id), row.delivery_mode])),
    [modesQuery.data],
  );

  return useMemo(
    () => sessions.map((session) => ({
      ...session,
      deliveryMode: resolveSessionDeliveryMode(session.deliveryMode, modesById.get(session.id)),
    })),
    [modesById, sessions],
  );
}
