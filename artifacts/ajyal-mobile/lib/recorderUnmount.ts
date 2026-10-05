type RecorderForUnmount = {
  readonly isRecording: boolean;
  stop: () => Promise<unknown>;
};

export function stopRecorderOnUnmount(
  recorder: RecorderForUnmount,
  processingTurn: boolean,
): void {
  if (processingTurn) return;
  try {
    if (recorder.isRecording) {
      void recorder.stop().catch(() => undefined);
    }
  } catch {
    // The native recorder can be released while its screen is unmounting.
  }
}