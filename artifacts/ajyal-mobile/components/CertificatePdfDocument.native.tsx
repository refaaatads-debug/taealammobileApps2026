import React, { useEffect, useRef } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { StyleSheet, Text, View } from "react-native";

type CertificatePdfDocumentProps = {
  uri: string;
  retryKey: number;
  onLoadComplete: () => void;
  onError: () => void;
};

function UnsupportedPdfPreview({
  onLoadComplete,
  message,
}: {
  onLoadComplete: () => void;
  message: string;
}) {
  const finishLoading = useRef(onLoadComplete);
  useEffect(() => {
    finishLoading.current();
  }, []);
  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableText}>{message}</Text>
    </View>
  );
}

export default function CertificatePdfDocument({
  uri,
  retryKey,
  onLoadComplete,
  onError,
}: CertificatePdfDocumentProps) {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return (
      <UnsupportedPdfPreview
        onLoadComplete={onLoadComplete}
        message="معاينة PDF غير متاحة في محاكي Expo Go. افتح التطبيق المبني لمعاينة الشهادة."
      />
    );
  }

  let Pdf: React.ComponentType<{
    source: { uri: string; cache: boolean };
    style: typeof styles.viewerPdf;
    trustAllCerts: boolean;
    fitPolicy: number;
    onLoadComplete: () => void;
    onError: () => void;
  }>;
  try {
    // Load the native PDF module only when a PDF is actually opened. Expo Go
    // does not include react-native-blob-util, but other profile sections work.
    Pdf = require("react-native-pdf").default;
  } catch {
    return (
      <UnsupportedPdfPreview
        onLoadComplete={onLoadComplete}
        message="عارض PDF غير متوفر في هذه النسخة. أعد بناء التطبيق لتفعيل معاينة الشهادات."
      />
    );
  }

  return (
    <Pdf
      key={`${uri}:${retryKey}`}
      source={{ uri, cache: false }}
      style={styles.viewerPdf}
      trustAllCerts={false}
      fitPolicy={0}
      onLoadComplete={onLoadComplete}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  viewerPdf: { flex: 1, width: "100%", backgroundColor: "#FFFFFF" },
  unavailable: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FFFFFF" },
  unavailableText: { color: "#475569", textAlign: "center", lineHeight: 22 },
});
