import type { WhiteboardAction } from "@/components/SessionWhiteboard";

export function whiteboardActionSignature(action: WhiteboardAction): string {
  return JSON.stringify(action);
}

export function filterClearedWhiteboardActions(
  actions: WhiteboardAction[],
  clearedSignatures: ReadonlySet<string>,
): WhiteboardAction[] {
  return actions.filter((action) => !clearedSignatures.has(whiteboardActionSignature(action)));
}

export function sampleWhiteboardPath<T extends { x: number; y: number }>(
  points: T[],
  timestamps: number[],
  intervalMs = 120,
): T[] {
  if (points.length <= 2 || !Number.isFinite(intervalMs) || intervalMs <= 0) return points;

  const sampled = [points[0]];
  let lastSampleAt = Number.isFinite(timestamps[0]) ? timestamps[0] : 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const timestamp = Number.isFinite(timestamps[index]) ? timestamps[index] : lastSampleAt;
    if (timestamp - lastSampleAt >= intervalMs) {
      sampled.push(points[index]);
      lastSampleAt = timestamp;
    }
  }

  const lastPoint = points[points.length - 1];
  if (sampled[sampled.length - 1] !== lastPoint) sampled.push(lastPoint);
  return sampled;
}
