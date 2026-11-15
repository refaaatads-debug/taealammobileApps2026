type BookingRequestLike = {
  id: string;
  groupId?: string | null;
  status: string;
  subject: string;
  scheduledAt: string | Date;
  durationMinutes: number;
};

type SessionLike = {
  subject: string;
  scheduledAt: string;
  duration: string;
  status?: string;
  deliveryMode?: 'online' | 'in_person';
};

export type BookingRequestGroup<T extends BookingRequestLike> = {
  request: T;
  count: number;
  items: T[];
};

function normalizeStatus(status: string): string {
  return status === 'confirmed' ? 'accepted' : status;
}

function durationMinutes(value: string): number | null {
  const digits = value.match(/[0-9٠-٩۰-۹]+/u)?.[0];
  if (!digits) return null;
  const normalized = digits
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasMatchingSession(request: BookingRequestLike, sessions: SessionLike[]): boolean {
  const requestStart = request.scheduledAt instanceof Date
    ? request.scheduledAt.getTime()
    : new Date(request.scheduledAt).getTime();
  if (!Number.isFinite(requestStart)) return false;

  return sessions.some((session) => {
    if (!session.status || session.deliveryMode === 'in_person') return false;
    if (session.subject.trim() !== request.subject.trim()) return false;
    const sessionStart = new Date(session.scheduledAt).getTime();
    if (!Number.isFinite(sessionStart) || sessionStart !== requestStart) return false;
    const sessionDuration = durationMinutes(session.duration);
    return sessionDuration === null || sessionDuration === request.durationMinutes;
  });
}

export function groupBookingRequests<T extends BookingRequestLike>(requests: T[]): BookingRequestGroup<T>[] {
  const groups = new Map<string, BookingRequestGroup<T>>();
  for (const request of requests) {
    const key = request.groupId || request.id;
    const group = groups.get(key);
    if (group) {
      group.items.push(request);
      group.count += 1;
    } else {
      groups.set(key, { request, count: 1, items: [request] });
    }
  }
  return [...groups.values()];
}

export function filterBookingRequestGroupsByStatus<T extends BookingRequestLike>(
  groups: BookingRequestGroup<T>[],
  statuses: string[],
): BookingRequestGroup<T>[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => statuses.includes(normalizeStatus(item.status)));
    return items.length ? [{ request: items[0], count: items.length, items }] : [];
  });
}

export function filterUnbookedAcceptedRequestGroups<T extends BookingRequestLike>(
  groups: BookingRequestGroup<T>[],
  sessions: SessionLike[],
): BookingRequestGroup<T>[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) =>
      normalizeStatus(item.status) === 'accepted' && !hasMatchingSession(item, sessions),
    );
    return items.length ? [{ request: items[0], count: items.length, items }] : [];
  });
}

export function applyBookingRequestStatusUpdate<T extends BookingRequestLike>(
  requests: T[] | undefined,
  update: Record<string, unknown>,
  role: 'student' | 'teacher',
): T[] | undefined {
  if (!requests) return requests;
  const id = typeof update.id === 'string' ? update.id : '';
  const groupId = typeof update.groupId === 'string'
    ? update.groupId
    : typeof update.group_id === 'string' ? update.group_id : '';
  const status = typeof update.status === 'string' ? normalizeStatus(update.status) : '';
  if (!id || !status) return requests;

  const belongsToUpdate = (request: BookingRequestLike) =>
    request.id === id || Boolean(groupId && request.groupId === groupId);

  if (role === 'teacher' && status !== 'open') {
    return requests.filter((request) => !belongsToUpdate(request));
  }

  const acceptedBy = typeof update.acceptedBy === 'string'
    ? update.acceptedBy
    : typeof update.accepted_by === 'string' ? update.accepted_by : undefined;
  return requests.map((request) => {
    if (!belongsToUpdate(request)) return request;
    return {
      ...request,
      status,
      ...(acceptedBy ? { acceptedBy } : {}),
    } as T;
  });
}
