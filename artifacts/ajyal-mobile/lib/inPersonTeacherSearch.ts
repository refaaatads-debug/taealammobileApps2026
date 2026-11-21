export function isCurrentInPersonTeacherSearch(requestId: number, activeRequestId: number): boolean {
  return requestId === activeRequestId;
}
