type MessageRecord = Record<string, unknown>;

function asRecord(value: unknown): MessageRecord | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as MessageRecord
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as MessageRecord
    : null;
}

function messageType(message: MessageRecord): string {
  const candidates = [message.type, message.event, message.kind, message.messageType];
  return String(candidates.find((value) => typeof value === 'string' && /whiteboard/i.test(value)) ?? '')
    .toLowerCase()
    .replace(/[_:]/g, '-');
}

function nestedSources(message: MessageRecord): MessageRecord[] {
  const payload = asRecord(message.payload);
  const data = asRecord(message.data);
  return [
    message,
    payload,
    data,
    asRecord(payload?.data),
    asRecord(data?.data),
    asRecord(payload?.permission),
    asRecord(data?.permission),
  ].filter((value): value is MessageRecord => Boolean(value));
}

function firstBoolean(sources: MessageRecord[], keys: string[]): boolean | null {
  for (const source of sources) {
    for (const key of keys) {
      if (typeof source[key] === 'boolean') return source[key] as boolean;
    }
  }
  return null;
}

/**
 * Reads both the current platform contract (`open`) and older session clients.
 */
export function readPlatformWhiteboardVisibility(input: unknown): boolean | null {
  const message = asRecord(input);
  if (!message) return null;
  const type = messageType(message);
  if (!['whiteboard-toggle', 'whiteboard-state', 'whiteboard-sync', 'whiteboard-data', 'whiteboard-update'].includes(type)) {
    return null;
  }
  const sources = nestedSources(message);
  return firstBoolean(sources, ['open', 'enabled', 'active', 'isSharing']);
}

/**
 * Reads the platform contract (`allow`) plus older permission aliases.
 */
export function readPlatformWhiteboardPermission(input: unknown): boolean | null {
  const message = asRecord(input);
  if (!message) return null;
  const type = messageType(message);
  const carriesBoardState = ['whiteboard-state', 'whiteboard-sync', 'whiteboard-data', 'whiteboard-update'].includes(type);
  if (
    !carriesBoardState
    && !type.includes('permission')
    && !type.includes('access')
    && !type.includes('edit')
    && !type.includes('write')
  ) {
    return null;
  }
  return firstBoolean(nestedSources(message), [
    'allow',
    'canWrite',
    'allowStudentDrawing',
    'studentCanDraw',
    'canEdit',
    'editable',
    'writeEnabled',
    'can_write',
    'allow_student_drawing',
    'student_can_draw',
    'enabled',
    'allowed',
    'permitted',
  ]);
}
