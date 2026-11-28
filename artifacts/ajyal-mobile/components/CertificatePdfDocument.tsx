import React, { createElement } from "react";

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
  return createElement("iframe", {
    key: `${uri}:${retryKey}`,
    src: uri,
    title: "معاينة الشهادة PDF",
    "aria-label": "معاينة الشهادة PDF",
    onLoad: onLoadComplete,
    onError,
    style: { width: "100%", height: "100%", border: 0, backgroundColor: "#fff" },
  });
}
