export type EdgeFunctionErrorDetails = {
  status: number | null;
  message: string | null;
};

type CloneableResponse = {
  status?: unknown;
  clone: () => { text: () => Promise<string> };
};

const MAX_RESPONSE_BODY_LENGTH = 16_384;
const MAX_MESSAGE_LENGTH = 240;

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:authorization|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s,;"']+/gi,
  /\b(?:sk-(?:live|test)-?[A-Za-z0-9_-]{8,}|sk_(?:live|test)_[A-Za-z0-9_-]{8,}|sb_(?:publishable|secret|service_role)_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function responseStatus(context: CloneableResponse): number | null {
  return typeof context.status === "number"
    && Number.isInteger(context.status)
    && context.status >= 100
    && context.status <= 599
    ? context.status
    : null;
}

function sanitizeMessage(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  let message = String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const pattern of SECRET_PATTERNS) {
    message = message.replace(pattern, "[redacted]");
  }
  message = message.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH).trim();
  return message || null;
}

/**
 * Extracts only short, allowlisted details from a Supabase Functions error.
 * The response is cloned before reading so callers can still inspect it.
 */
export async function extractEdgeFunctionError(error: unknown): Promise<EdgeFunctionErrorDetails> {
  const context = isRecord(error) ? error.context : null;
  if (
    !isRecord(context)
    || typeof context.clone !== "function"
  ) {
    return { status: null, message: null };
  }

  const cloneableResponse = context as unknown as CloneableResponse;
  const status = responseStatus(cloneableResponse);
  try {
    const bodyText = await cloneableResponse.clone().text();
    if (bodyText.length > MAX_RESPONSE_BODY_LENGTH) return { status, message: null };

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return { status, message: null };
    }
    if (!isRecord(body)) return { status, message: null };

    for (const field of ["error", "message", "code"] as const) {
      const message = sanitizeMessage(body[field]);
      if (message) return { status, message };
    }
  } catch {
    // Keep the HTTP status if the response body cannot be cloned or read.
  }

  return { status, message: null };
}