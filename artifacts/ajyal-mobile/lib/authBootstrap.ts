export type AuthBootstrapUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

/**
 * Keeps an empty getSession() result from declaring the user signed out before
 * Supabase emits INITIAL_SESSION. That event is the authoritative empty state.
 */
export function createInitialAuthBootstrapGate(
  onResolved: (user: AuthBootstrapUser | null) => void,
) {
  let resolved = false;

  return {
    resolveFromSessionQuery(user: AuthBootstrapUser | null, stale: boolean): void {
      if (resolved || stale || !user) return;
      resolved = true;
      onResolved(user);
    },
    resolveFromInitialEvent(user: AuthBootstrapUser | null): void {
      if (resolved) return;
      resolved = true;
      onResolved(user);
    },
  };
}