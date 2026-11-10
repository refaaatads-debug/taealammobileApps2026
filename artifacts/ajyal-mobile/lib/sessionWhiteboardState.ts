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
