type CallDirectionInput = {
  status: string;
  callerId?: string;
} | null;

export function isOutgoingRingingCallForUser(
  call: CallDirectionInput,
  userId: string | null | undefined,
): boolean {
  return Boolean(call && userId && call.status === 'ringing' && call.callerId === userId);
}