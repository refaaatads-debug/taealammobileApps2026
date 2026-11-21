export type LearningMaterialLabel = {
  category: string;
  title: string;
};

export function getLearningMaterialLabel(name: string): LearningMaterialLabel {
  const parts = name.trim().split(/\s[-–—]\s/).filter(Boolean);
  if (parts.length > 1) {
    return { category: parts[0], title: parts.slice(1).join(" - ") };
  }
  return { category: "مصدر تعليمي", title: name.trim() || "مادة تعليمية" };
}

export function getSafeLearningMaterialUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    return url.protocol === "https:" && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getLearningMaterialHostname(rawUrl: string): string {
  const safeUrl = getSafeLearningMaterialUrl(rawUrl);
  if (!safeUrl) return "";
  return new URL(safeUrl).hostname;
}
