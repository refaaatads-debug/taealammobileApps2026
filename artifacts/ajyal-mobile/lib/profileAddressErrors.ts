export type ProfileAddressLanguage = "ar" | "en";

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
