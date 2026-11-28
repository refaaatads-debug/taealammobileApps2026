type BookingRequestLike = {
  id: string;
  groupId?: string | null;
  status: string;
  bookingStatus?: string | null;
  booking_status?: string | null;
  requestStatus?: string | null;
  request_status?: string | null;
  sessionStatus?: string | null;
  session_status?: string | null;
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
  const normalized = status.trim().toLowerCase();
  return normalized === 'confirmed' ? 'accepted' : normalized;
}

function statusValue(value: unknown): string {
  return typeof value === 'string' ? normalizeStatus(value) : '';
}

export function isPendingBookingRequest(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const rawRequestStatus = statusValue(row.requestStatus ?? row.request_status ?? row.status);
  const requestStatus = rawRequestStatus || 'open';
  const rowStatus = statusValue(row.status);
  const explicitRequestStatus = statusValue(row.requestStatus ?? row.request_status);
  const bookingStatus = statusValue(row.bookingStatus ?? row.booking_status);
  const sessionStatus = statusValue(row.sessionStatus ?? row.session_status);
  const resolvedStatuses = new Set(['accepted', 'completed', 'cancelled', 'rejected', 'expired', 'ended']);

  if (
    resolvedStatuses.has(rowStatus)
    || resolvedStatuses.has(explicitRequestStatus)
    || resolvedStatuses.has(requestStatus)
    || resolvedStatuses.has(bookingStatus)
    || resolvedStatuses.has(sessionStatus)
  ) {
    return false;
  }

  return requestStatus === 'open' || requestStatus === 'pending';
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
  sessions: SessionLike[] = [],
): BookingRequestGroup<T>[] {
  const normalizedStatuses = statuses.map(normalizeStatus);
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => (
      normalizedStatuses.includes(normalizeStatus(item.status))
      && (!normalizedStatuses.includes('open') || isPendingBookingRequest(item))
      && (!normalizedStatuses.includes('open') || !hasMatchingSession(item, sessions))
    ));
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
