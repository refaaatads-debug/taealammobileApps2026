export type ProfileAddressLanguage = "ar" | "en";

export function getLocationSaveFailureMessage(
  error: unknown,
  language: ProfileAddressLanguage,
): string {
  const details = error && typeof error === "object"
    ? error as { code?: unknown; message?: unknown }
    : {};
  const code = typeof details.code === "string" ? details.code : null;
  const message = typeof details.message === "string" ? details.message.toLowerCase() : "";

  if (code === "42501" || code === "42500") {
    return language === "ar"
      ? "رفضت صلاحيات قاعدة البيانات حفظ الموقع. احتفظنا بتعديلاتك."
      : "The database did not authorize saving the location. Your edits are still here.";
  }

  if (code === "PGRST202" || code === "42883") {
    return language === "ar"
      ? "دالة حفظ الموقع غير متاحة حالياً على الخادم. احتفظنا بتعديلاتك."
      : "The location-saving function is not available on the server. Your edits are still here.";
  }

  if (code === "23503") {
    return language === "ar"
      ? "المدينة المختارة غير متاحة للحفظ. اختر المدينة مرة أخرى."
      : "The selected city is unavailable. Choose the city again.";
  }

  if (code === "22P02") {
    return language === "ar"
      ? "بيانات المدينة غير صالحة. اختر المدينة مرة أخرى."
      : "The city data is invalid. Choose the city again.";
  }

  if (code === "23514") {
    return language === "ar"
      ? "تحقق من إحداثيات الموقع ونطاق الخدمة ثم أعد المحاولة."
      : "Check the location coordinates and service radius, then try again.";
  }

  if (!code && /network|fetch|timeout|timed out/iu.test(message)) {
    return language === "ar"
      ? "تعذر الاتصال بالخدمة. احتفظنا بتعديلاتك؛ أعد المحاولة."
      : "Could not reach the service. Your edits are still here; please retry.";
  }

  const suffix = code ? ` (${code})` : "";
  return language === "ar"
    ? `تعذر حفظ الموقع${suffix}. احتفظنا بالتعديلات؛ أعد المحاولة.`
    : `Could not save the location${suffix}. Your edits are still here; please retry.`;
}

export function getAddressDeleteFailureMessage(
  code: string | null | undefined,
  language: ProfileAddressLanguage,
): string {
  if (code === "23503") {
    return language === "ar"
      ? "لا يمكن حذف العنوان لأنه مرتبط بطلب أو حجز سابق. احتفظ به حتى لا تتأثر سجلاته."
      : "This address is linked to an earlier request or booking. Keep it so those records remain intact.";
  }

  if (code === "42501" || code === "42500") {
    return language === "ar"
      ? "رفضت صلاحيات قاعدة البيانات حذف العنوان. لم يتغير شيء؛ يلزم فحص صلاحية الحذف قبل تعديلها."
      : "The database did not authorize this deletion. Nothing changed; the delete policy must be reviewed before it is changed.";
  }

  if (code === "NO_ROW") {
    return language === "ar"
      ? "لم يؤكد النظام حذف العنوان. أعد تحميل الصفحة ثم حاول مرة أخرى."
      : "The system did not confirm the deletion. Reload the page and try again.";
  }

  return language === "ar"
    ? "تعذر حذف العنوان. تحقق من الاتصال ثم حاول مرة أخرى."
    : "Could not delete the address. Check your connection and try again.";
}
