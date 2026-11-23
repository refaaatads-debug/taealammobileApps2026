import { supabase } from "./supabase";
import { normalizeSaudiMobile, assertSamePhoneAccount, validatePhoneOtp } from "./phoneAuthPolicy";

// Branch-only preparation. Not imported by the released app. Provider setup and
// real-device verification require a separate approval before enabling any UI.
const client = () => {
  if (!supabase) throw new Error("تعذر إعداد اتصال المنصة");
  return supabase;
};

export async function requestExistingPhoneLogin(rawPhone: string) {
  const phone = normalizeSaudiMobile(rawPhone);
  const { error } = await client().auth.signInWithOtp({ phone, options: { shouldCreateUser: false, channel: "sms" } });
  if (error) throw error;
  return phone;
}

export async function confirmExistingPhoneLogin(phone: string, code: string) {
  const { data, error } = await client().auth.verifyOtp({ phone: normalizeSaudiMobile(phone), token: validatePhoneOtp(code), type: "sms" });
  if (error) throw error;
  if (!data.user || !data.session) throw new Error("لم تصل جلسة موثقة للحساب");
  // The app's existing /me profile + role gate must pass before opening a dashboard.
  return data;
}

export async function requestLinkPhone(expectedUserId: string, rawPhone: string) {
  const auth = client();
  const current = await auth.auth.getUser();
  if (current.error) throw current.error;
  assertSamePhoneAccount(expectedUserId, current.data.user?.id);
  const phone = normalizeSaudiMobile(rawPhone);
  const { data, error } = await auth.auth.updateUser({ phone });
  if (error) throw error;
  assertSamePhoneAccount(expectedUserId, data.user?.id);
  return phone;
}

export async function confirmLinkPhone(expectedUserId: string, phone: string, code: string) {
  const auth = client();
  const current = await auth.auth.getUser();
  if (current.error) throw current.error;
  assertSamePhoneAccount(expectedUserId, current.data.user?.id);
  const { data, error } = await auth.auth.verifyOtp({ phone: normalizeSaudiMobile(phone), token: validatePhoneOtp(code), type: "phone_change" });
  if (error) throw error;
  assertSamePhoneAccount(expectedUserId, data.user?.id);
  if (!data.user?.phone_confirmed_at) throw new Error("لم يتم تأكيد رقم الجوال بعد");
  return data;
}
