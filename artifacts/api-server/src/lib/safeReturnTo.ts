const RETURN_TO_ORIGIN = "https://return-to.invalid";
const MAX_RETURN_TO_LENGTH = 2_048;
const MAX_DECODE_PASSES = 16;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;

function decodePercentEscapes(value: string): string {
  return value.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_RETURN_TO_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return "/";
  }

  let candidate = value;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (
      !candidate.startsWith("/") ||
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      CONTROL_CHARACTERS.test(candidate)
    ) {
      return "/";
    }

    const pathEnd = candidate.search(/[?#]/);
    const pathname = pathEnd === -1 ? candidate : candidate.slice(0, pathEnd);
    if (ENCODED_PATH_SEPARATOR.test(pathname)) return "/";

    try {
      if (new URL(candidate, RETURN_TO_ORIGIN).origin !== RETURN_TO_ORIGIN) return "/";
    } catch {
      return "/";
    }

    const decoded = decodePercentEscapes(candidate);
    if (decoded === candidate) return value;
    candidate = decoded;
  }

  // Excessively nested encoding is ambiguous; fail closed rather than leave
  // a later decoding layer able to change the redirect destination.
  return "/";
}
