import React from "react";
import { StyleSheet } from "react-native";
import Pdf from "react-native-pdf";

type CertificatePdfDocumentProps = {
  uri: string;
  retryKey: number;
  onLoadComplete: () => void;
  onError: () => void;
};

export default function CertificatePdfDocument({
  uri,
  retryKey,
  onLoadComplete,
  onError,
}: CertificatePdfDocumentProps) {
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
});
