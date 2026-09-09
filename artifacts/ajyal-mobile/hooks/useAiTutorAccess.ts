import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAjyal } from "@/hooks/useAjyal";
import { hasAiTutorEntitlement, type SubscriptionRow } from "@/lib/subscriptionEntitlements";

export function useAiTutorAccess(enabled = true) {
  const { user } = useAuth();
  const { role, roleResolved } = useAjyal();
  const [loading, setLoading] = useState(enabled);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      setLoading(false);
      setHasAccess(roleResolved && role === "student");
      setError(null);
      return () => { active = false; };
    }

    if (!roleResolved || role !== "student" || !supabase || !user) {
      setLoading(!roleResolved);
      setHasAccess(false);
      setError(null);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const subscriptionsResult = await supabase
          .from("user_subscriptions")
          .select("*")
          .eq("user_id", user.id);
        if (subscriptionsResult.error) throw subscriptionsResult.error;

        const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
        const planIds = [...new Set(
          subscriptions
            .map((subscription) => typeof subscription.plan_id === "string" ? subscription.plan_id : null)
            .filter((planId): planId is string => Boolean(planId)),
        )];
        const plansResult = planIds.length
          ? await supabase.from("subscription_plans").select("*").in("id", planIds)
          : { data: [], error: null };
        if (plansResult.error) throw plansResult.error;

        if (active) {
          setHasAccess(hasAiTutorEntitlement(subscriptions, (plansResult.data ?? []) as SubscriptionRow[]));
        }
      } catch {
        if (active) {
          setHasAccess(false);
          setError("تعذر التحقق من أهلية مساعد التعلم من المنصة.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [enabled, revision, role, roleResolved, user?.id]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { loading, hasAccess, error, retry, role, roleResolved };
}