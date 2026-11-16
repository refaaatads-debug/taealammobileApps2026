import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Alert } from "react-native";
import {
  getListMyAssignmentsQueryKey,
  getListBookingRequestsQueryKey,
  getListMyNotificationsQueryKey,
  getListMySessionsQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { Role, UserProfile } from "@/constants/localData";
import type { Notification as ApiNotification } from "@workspace/api-client-react";
import {
  ajyalNotificationsQueryKey,
  cancelAjyalSession,
  completeAjyalAssignment,
  loadAjyalNotifications,
  loadAjyalProfile,
  markAjyalNotificationRead,
  markAllAjyalNotificationsRead,
  type AjyalSupabaseClient,
} from "@/lib/ajyalDirectData";
import { supabase, supabaseConfigError } from "@/lib/supabase";

type AjyalContextValue = {
  role: Role;
  roleResolved: boolean;
  profile: UserProfile | undefined;
  profileError: boolean;
  retryProfile: () => Promise<void>;
  notifications: ApiNotification[];
  notificationsLoading: boolean;
  notificationsError: boolean;
  retryNotifications: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  completeAssignment: (id: string) => Promise<void>;
  markAllRead: () => void;
  markRead: (id: string) => void;
  cancelSession: (id: string, reason?: string) => void;
};

const AjyalContext = createContext<AjyalContextValue | null>(null);

function requireSupabaseClient(): AjyalSupabaseClient {
  if (!supabase) throw new Error(supabaseConfigError ?? "تعذر إعداد اتصال المنصة.");
  return supabase as unknown as AjyalSupabaseClient;
}

function readableOperationError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/[\u0600-\u06ff]/.test(message)) return message;
  if (/42501|row-level security|permission denied/i.test(message)) {
    return "لا تسمح صلاحيات الحساب بهذا الإجراء.";
  }
  return fallback;
}

export function AjyalProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.user?.id ?? "";
  const profileQuery = useQuery({
    queryKey: ["ajyal", "profile", userId],
    enabled: Boolean(auth.isAuthenticated && userId),
    queryFn: () => {
      if (!auth.user) throw new Error("تعذر التحقق من الحساب.");
      return loadAjyalProfile(requireSupabaseClient(), auth.user);
    },
    staleTime: 60_000, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1,
    retryDelay: (attempt) => Math.min(750 * (attempt + 1), 2_000),
  });
  const profile = profileQuery.data ?? undefined;
  const roleResolved = Boolean(profile?.role && profile.roles?.length);
  const notificationsQuery = useQuery({
    queryKey: ajyalNotificationsQueryKey(userId),
    enabled: Boolean(auth.isAuthenticated && roleResolved && userId),
    queryFn: () => loadAjyalNotifications(requireSupabaseClient(), userId),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
  const completeMutation = useMutation({
    mutationFn: ({ id, userId: ownerId }: { id: string; userId: string }) =>
      completeAjyalAssignment(requireSupabaseClient(), ownerId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMyAssignmentsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
      ]);
    },
    onError: (error) => {
      Alert.alert("تعذر إكمال الواجب", readableOperationError(error, "تحقق من اتصالك وتسليم الواجب ثم حاول مرة أخرى."));
    },
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, userId: ownerId, reason }: { id: string; userId: string; reason?: string }) =>
      cancelAjyalSession(requireSupabaseClient(), ownerId, id, reason),
    onError: (error) => {
      Alert.alert("تعذر إلغاء الجلسة", readableOperationError(error, "تحقق من حالة الجلسة واتصالك ثم حاول مرة أخرى."));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMySessionsQueryKey({ view: "upcoming" }) }),
        queryClient.invalidateQueries({ queryKey: getListMySessionsQueryKey({ view: "past" }) }),
        queryClient.invalidateQueries({ queryKey: getListBookingRequestsQueryKey({ view: "mine" }) }),
        queryClient.invalidateQueries({ queryKey: getListBookingRequestsQueryKey({ view: "incoming" }) }),
        queryClient.invalidateQueries({ queryKey: ["in-person-request-groups"] }),
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ajyalNotificationsQueryKey(userId) }),
      ]);
    },
  });
  const readMutation = useMutation({
    mutationFn: ({ id, userId: ownerId }: { id: string; userId: string }) =>
      markAjyalNotificationRead(requireSupabaseClient(), ownerId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ajyalNotificationsQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
      ]);
    },
    onError: (error) => {
      Alert.alert("تعذر تحديث الإشعار", readableOperationError(error, "تحقق من اتصالك ثم حاول مرة أخرى."));
    },
  });
  const readAllMutation = useMutation({
    mutationFn: (ownerId: string) => markAllAjyalNotificationsRead(requireSupabaseClient(), ownerId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ajyalNotificationsQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
      ]);
    },
    onError: (error) => {
      Alert.alert("تعذر تحديث الإشعارات", readableOperationError(error, "تحقق من اتصالك ثم حاول مرة أخرى."));
    },
  });

  // The student value only satisfies existing component types. roleResolved
  // stays false until Supabase returns a profile and an authoritative role,
  // and the root navigator blocks all account routes until then.
  const retryProfile = useCallback(async () => {
    await profileQuery.refetch();
  }, [profileQuery.refetch]);
  const retryNotifications = useCallback(async () => {
    await notificationsQuery.refetch();
  }, [notificationsQuery.refetch]);
  const logout = useCallback(async () => {
    await auth.logout();
    queryClient.clear();
  }, [auth.logout, queryClient]);
  const value = useMemo<AjyalContextValue>(() => ({
    role: profile?.role ?? "student",
    roleResolved,
    profile,
    profileError: profileQuery.isError,
    retryProfile,
    notifications: notificationsQuery.data ?? [],
    notificationsLoading: notificationsQuery.isLoading,
    notificationsError: notificationsQuery.isError,
    retryNotifications,
    isLoading: auth.isLoading || (auth.isAuthenticated && profileQuery.isLoading),
    isAuthenticated: auth.isAuthenticated,
    login: auth.login,
    logout,
    completeAssignment: async (id) => {
      if (!userId) throw new Error("تعذر التحقق من الحساب.");
      await completeMutation.mutateAsync({ id, userId });
    },
    markAllRead: () => {
      if (userId) readAllMutation.mutate(userId);
    },
    markRead: (id) => {
      if (userId) readMutation.mutate({ id, userId });
    },
    cancelSession: (id, reason) => {
      if (userId) cancelMutation.mutate({ id, userId, reason });
      else Alert.alert("تعذر إلغاء الجلسة", "تعذر التحقق من الحساب. سجّل الدخول ثم حاول مرة أخرى.");
    },
  }), [
    auth,
    logout,
    profile,
    profileQuery.isError,
    roleResolved,
    retryProfile,
    profileQuery.isLoading,
    notificationsQuery.data,
    notificationsQuery.isLoading,
    notificationsQuery.isError,
    retryNotifications,
    userId,
    completeMutation,
    readAllMutation,
    readMutation,
    cancelMutation,
  ]);

  return <AjyalContext.Provider value={value}>{children}</AjyalContext.Provider>;
}

export function useAjyal(): AjyalContextValue {
  const context = useContext(AjyalContext);
  if (!context) throw new Error("useAjyal must be used inside AjyalProvider");
  return context;
}