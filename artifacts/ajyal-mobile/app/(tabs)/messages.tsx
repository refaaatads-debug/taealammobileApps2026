import React from "react";
import MessagesScreen from "@/components/MessagesScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";

export default function MessagesRoute() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, stackTrace) => {
        console.error("[messages] render error:", error, stackTrace);
      }}
    >
      <MessagesScreen />
    </ErrorBoundary>
  );
}