import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/errorReporting";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAjyal } from "@/hooks/useAjyal";
import { hasAiTutorEntitlement, type SubscriptionRow } from "@/lib/subscriptionEntitlements";

const ACCESS_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ai tutor access timeout: ${label}`)), ACCESS_TIMEOUT_MS);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function useAiTutorAccess(enabled = true) {
  const { user } = useAuth();
  const { role, roleResolved } = useAjyal();
  const [loading, setLoading] = useState(enabled);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  // Last successful answer per user: later re-checks refresh quietly instead of
  // flashing the full-screen spinner again.
  const resolvedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      setLoading(false);
      setHasAccess(roleResolved && role === "student");
      setError(null);
      return () => { active = false; };
    }

    if (!roleResolved || role !== "student" || !supabase || !user) {
      // Role still loading: keep the spinner, but never forever.
      setLoading(!roleResolved);
      if (!roleResolved) {
        const timer = setTimeout(() => {
          if (!active) return;
          reportError(new Error("ai tutor access: role not resolved after 12s"), { hasUser: Boolean(user) }, "voice");
          setLoading(false);
          setError("تعذر التحقق من الحساب. تأكد من الاتصال ثم أعد المحاولة.");
        }, ACCESS_TIMEOUT_MS);
        return () => { active = false; clearTimeout(timer); };
      }
      setHasAccess(false);
      setError(null);
      return () => { active = false; };
    }

    if (resolvedForUserRef.current !== user.id) setLoading(true);
    setError(null);
    void (async () => {
      try {
        const subscriptionsResult = await withTimeout(supabase
          .from("user_subscriptions")
          .select("*")
          .eq("user_id", user.id), "subscriptions");
        if (subscriptionsResult.error) throw subscriptionsResult.error;

        const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
        const planIds = [...new Set(
          subscriptions
            .map((subscription) => typeof subscription.plan_id === "string" ? subscription.plan_id : null)
            .filter((planId): planId is string => Boolean(planId)),
        )];
        const plansResult = planIds.length
          ? await withTimeout(supabase.from("subscription_plans").select("*").in("id", planIds), "plans")
          : { data: [], error: null };
        if (plansResult.error) throw plansResult.error;

        if (active) {
          setHasAccess(hasAiTutorEntitlement(subscriptions, (plansResult.data ?? []) as SubscriptionRow[]));
          resolvedForUserRef.current = user.id;
        }
      } catch (accessError) {
        reportError(accessError, { step: "ai-tutor-access" }, "voice");
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