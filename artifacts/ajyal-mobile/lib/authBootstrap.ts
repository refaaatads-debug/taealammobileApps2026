export type AuthBootstrapUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

/**
 * Wait for both initial Supabase checks before confirming a signed-out state.
 * Either source can restore a non-empty session first.
 */
export function createInitialAuthBootstrapGate(
  onResolved: (user: AuthBootstrapUser | null) => void,
) {
  let resolved = false;
  let initialEventSeen = false;
  let sessionQuerySeen = false;
  let initialEventUser: AuthBootstrapUser | null = null;
  let sessionQueryUser: AuthBootstrapUser | null = null;

  const resolve = (user: AuthBootstrapUser | null) => {
    if (resolved) return;
    resolved = true;
    onResolved(user);
  };

  const resolveSignedOutIfConfirmed = () => {
    if (
      initialEventSeen &&
      sessionQuerySeen &&
      initialEventUser === null &&
      sessionQueryUser === null
    ) {
      resolve(null);
    }
  };

  return {
    resolveFromSessionQuery(user: AuthBootstrapUser | null, stale: boolean): void {
      if (resolved || stale) return;
      sessionQuerySeen = true;
      sessionQueryUser = user;
      if (user) {
        resolve(user);
        return;
      }
      resolveSignedOutIfConfirmed();
    },
    resolveFromInitialEvent(user: AuthBootstrapUser | null, stale = false): void {
      if (resolved || stale) return;
      initialEventSeen = true;
      initialEventUser = user;
      if (user) {
        resolve(user);
        return;
      }
      resolveSignedOutIfConfirmed();
    },
  };
}
