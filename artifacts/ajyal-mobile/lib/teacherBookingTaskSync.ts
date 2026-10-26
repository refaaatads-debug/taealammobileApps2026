type QueryInvalidator = {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
};

export function getTeacherInPersonRequestCountQueryKey(teacherId: string | undefined) {
  return ['teacher-in-person-request-count', teacherId] as const;
}

export function countOpenBookingRequestGroups(
  requests: readonly { id: string; groupId?: string | null; status: string }[],
): number {
  const openGroupKeys = new Set<string>();
  for (const request of requests) {
    if (request.status !== 'open') continue;
    openGroupKeys.add(request.groupId?.trim() || request.id);
  }
  return openGroupKeys.size;
}

export function getTeacherInPersonDecisionOutcome(
  data: unknown,
  error: unknown,
): 'success' | 'conflict' | 'error' {
  if (error) return 'error';
  return data === true ? 'success' : 'conflict';
}

export async function refreshTeacherBookingTaskCounts(
  queryClient: QueryInvalidator,
  teacherId: string,
  incomingOnlineRequestsQueryKey: readonly unknown[],
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: incomingOnlineRequestsQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: getTeacherInPersonRequestCountQueryKey(teacherId),
    }),
  ]);
}
