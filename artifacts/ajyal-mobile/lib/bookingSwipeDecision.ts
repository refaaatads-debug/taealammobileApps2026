export type BookingSwipeDecision = 'accepted' | 'rejected';

export function bookingSwipeDecision(
  translationX: number,
  velocityX: number,
  threshold: number,
): BookingSwipeDecision | null {
  'worklet';
  const safeThreshold = Math.max(1, Math.abs(threshold));
  if (Math.abs(translationX) >= safeThreshold) {
    return translationX > 0 ? 'accepted' : 'rejected';
  }
  if (Math.abs(velocityX) >= 650) {
    return velocityX > 0 ? 'accepted' : 'rejected';
  }
  return null;
}
