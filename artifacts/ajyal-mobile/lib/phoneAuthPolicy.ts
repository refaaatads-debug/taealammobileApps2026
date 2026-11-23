export function normalizeSaudiMobile(input: string): string {
  const digits = input.trim().replace(/[\s()-]/g, "").replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
  const normalized = digits.startsWith("00966") ? `+${digits.slice(2)}` : digits.startsWith("05") ? `+966${digits.slice(1)}` : /^5\d{8}$/.test(digits) ? `+966${digits}` : digits;
  if (!/^\+9665\d{8}$/.test(normalized)) throw new Error("أدخل رقم جوال سعودي صحيحًا مثل 05xxxxxxxx");
  return normalized;
}

export function assertSamePhoneAccount(expectedUserId: string, actualUserId?: string): void {
  if (!expectedUserId || expectedUserId !== actualUserId) throw new Error("تعذر تأكيد هوية الحساب. لم يتم ربط الرقم.");
}

export function validatePhoneOtp(code: string): string {
  const normalized = code.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632));
  if (!/^\d{6}$/.test(normalized)) throw new Error("أدخل رمز التحقق المكوّن من 6 أرقام");
  return normalized;
}
