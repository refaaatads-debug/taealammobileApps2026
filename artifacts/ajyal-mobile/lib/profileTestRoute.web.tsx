import React, { useMemo } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import ProfileScreen from "../app/(tabs)/profile";
import {
  createPersistentProfileTestClient,
  createProfileTestSession,
} from "./profileTestSessions";
import type { ProfileDataClient, ProfileRole } from "./profilePersistence";
import { profileUiTestMode } from "./supabase";
import { getProfileTestRedirectTarget } from "./profileTestPolicy";

export default function ProfileTestRoute() {
  const redirectTarget = getProfileTestRedirectTarget(profileUiTestMode);
  if (redirectTarget) return <Redirect href={redirectTarget} />;

  return <ProfileTestHarness />;
}

function ProfileTestHarness() {
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role: ProfileRole = roleParam === "teacher" ? "teacher" : "student";
  const session = useMemo(() => createProfileTestSession(role), [role]);
  const testHarness = useMemo(() => ({
    session,
    client: createPersistentProfileTestClient(session) as ProfileDataClient,
  }), [session]);

  return <ProfileScreen testHarness={testHarness} />;
}