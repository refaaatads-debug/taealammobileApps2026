type TutorNavigationOptions = {
  stopVoice: () => Promise<void>;
  canGoBack: () => boolean;
  goBack: () => void;
  replaceDashboard: () => void;
};

export async function leaveTutorAfterVoiceCleanup({
  stopVoice,
  canGoBack,
  goBack,
  replaceDashboard,
}: TutorNavigationOptions): Promise<void> {
  try {
    await stopVoice();
  } catch {
    // A cleanup failure should not trap the student on the tutor screen.
  }

  if (canGoBack()) {
    goBack();
  } else {
    replaceDashboard();
  }
}