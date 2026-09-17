import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

export default function ChatRoute() {
  const params = useLocalSearchParams<{ booking?: string; student?: string; participant?: string }>();
  return <Redirect href={{ pathname: "/(tabs)/messages", params }} />;
}