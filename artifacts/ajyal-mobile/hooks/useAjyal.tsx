import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Alert } from "react-native";
import {
  getListMyAssignmentsQueryKey,
  getListMyNotificationsQueryKey,
  getListMySessionsQueryKey,
  getGetMyProfileQueryKey,
  useCancelSession,
  useCompleteAssignment,
  useGetMyProfile,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { Role, UserProfile } from "@/constants/localData";

type AjyalContextValue = {
  role: Role;
  roleResolved: boolean;
  profile: UserProfile | undefined;
  profileError: boolean;
  retryProfile: () => Promise<void>;
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

export function AjyalProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useGetMyProfile({
    query: {
      queryKey: getGetMyProfileQueryKey(),
      enabled: auth.isAuthenticated,
      staleTime: 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(750 * (attempt + 1), 2_000),
    },
  });
  const completeMutation = useCompleteAssignment({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListMyAssignmentsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
        ]);
      },
    },
  });
  const cancelMutation = useCancelSession({
    mutation: {
      onError: () => {
        Alert.alert("تعذر إلغاء الجلسة", "تحقق من حالة الجلسة واتصالك ثم حاول مرة أخرى.");
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListMySessionsQueryKey({ view: "upcoming" }) }),
          queryClient.invalidateQueries({ queryKey: getListMySessionsQueryKey({ view: "past" }) }),
          queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
        ]);
      },
    },
  });
  const readMutation = useMarkNotificationRead({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });
      },
    },
  });
  const readAllMutation = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });
      },
    },
  });

  const profile = profileQuery.data;
  // The platform role is authoritative. A missing profile must never silently
  // become a student session; the root navigator blocks the app until this
  // request resolves successfully.
  const roleResolved = Boolean(profile?.role && profile.roles?.length);
  const retryProfile = useCallback(async () => {
    await profileQuery.refetch();
  }, [profileQuery.refetch]);
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
    isLoading: auth.isLoading || profileQuery.isLoading,
    isAuthenticated: auth.isAuthenticated,
    login: auth.login,
    logout,
    completeAssignment: async (id) => {
      await completeMutation.mutateAsync({ id });
    },
    markAllRead: () => readAllMutation.mutate(),
    markRead: (id) => readMutation.mutate({ id }),
    cancelSession: (id, reason) => cancelMutation.mutate({ id, data: reason ? { reason } : undefined }),
  }), [
    auth,
    logout,
    profile,
    profileQuery.isError,
    roleResolved,
    retryProfile,
    profileQuery.isLoading,
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