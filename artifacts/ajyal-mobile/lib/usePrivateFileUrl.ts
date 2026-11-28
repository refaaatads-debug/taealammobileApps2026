import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "./auth";
import { supabase, supabaseUrl } from "./supabase";
import { createPrivateFileRequestGate, PRIVATE_FILE_REFRESH_MS, signPrivateFile } from "./privateFiles";

export function usePrivateFileUrl(value: string, bucket: string) {
  const { user } = useAuth();
  const owner = user?.id ?? "";
  const [revision, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const gate = useRef(createPrivateFileRequestGate()).current;
  const [result, setResult] = useState({ key: "", url: null as string | null, status: "loading" as "loading" | "ready" | "error", expiresAt: 0 });
  const key = JSON.stringify([owner, revision, value, bucket, attempt]);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      gate.invalidate();
      setResult({ key: "", url: null, status: "loading", expiresAt: 0 });
      setRevision((current) => current + 1);
    });
    return () => data.subscription.unsubscribe();
  }, [gate]);
  useEffect(() => {
    const request = gate.begin();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      gate.invalidate();
      setResult({ key: "", url: null, status: "loading", expiresAt: 0 });
      setAttempt((current) => current + 1);
    };
    setResult({ key, url: null, status: "loading", expiresAt: 0 });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    if (!owner || !value) {
      setResult({ key, url: null, status: "error", expiresAt: 0 });
    } else {
      const requestedAt = Date.now();
      void signPrivateFile(supabase, value, bucket, supabaseUrl).then((url) => {
        if (!gate.isCurrent(request)) return;
        const expiresAt = requestedAt + PRIVATE_FILE_REFRESH_MS;
        if (expiresAt <= Date.now()) { refresh(); return; }
        setResult({ key, url, status: "ready", expiresAt });
        timer = setTimeout(refresh, expiresAt - Date.now());
      }).catch(() => {
        if (gate.isCurrent(request)) setResult({ key, url: null, status: "error", expiresAt: 0 });
      });
    }
    return () => {
      gate.invalidate();
      if (timer) clearTimeout(timer);
      appState.remove();
    };
  }, [key, owner, value, bucket, gate]);
  const visible = result.key === key && owner && (result.status !== "ready" || Date.now() < result.expiresAt);
  return {
    status: visible ? result.status : "loading" as const,
    url: visible ? result.url : null,
    retry: () => { gate.invalidate(); setAttempt((current) => current + 1); },
  };
}
