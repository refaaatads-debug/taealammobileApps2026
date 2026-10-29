export type GooglePlaceSuggestion = { placeId: string; description: string };
export type GooglePlaceDetails = {
  formattedAddress: string;
  city: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

export function parseAutocompleteSuggestions(payload: unknown): GooglePlaceSuggestion[] {
  const suggestions = objectValue(payload).suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions.flatMap((item): GooglePlaceSuggestion[] => {
    const prediction = objectValue(objectValue(item).placePrediction);
    const placeId = typeof prediction.placeId === "string" ? prediction.placeId.trim() : "";
    const description = typeof prediction.text?.text === "string" ? prediction.text.text.trim() : "";
    return placeId && description ? [{ placeId, description }] : [];
  }).slice(0, 5);
}

export function parsePlaceDetails(payload: unknown): GooglePlaceDetails {
  const details = objectValue(payload);
  const location = objectValue(details.location);
  const components = Array.isArray(details.addressComponents) ? details.addressComponents : [];
  const find = (...types: string[]) => components.find((part: unknown) => {
    const partTypes = objectValue(part).types;
    return Array.isArray(partTypes) && types.some((type) => partTypes.includes(type));
  });
  const cityPart = find("locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1");
  const countryPart = find("country");
  const city = String(objectValue(cityPart).longText ?? objectValue(cityPart).long_name ?? "").trim();
  const countryCode = String(objectValue(countryPart).shortText ?? objectValue(countryPart).short_name ?? "").trim().toUpperCase();
  const formattedAddress = typeof details.formattedAddress === "string" ? details.formattedAddress.trim() : "";
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (countryCode !== "SA") throw new Error("اختر موقعاً داخل المملكة العربية السعودية.");
  if (!city || !formattedAddress) throw new Error("لم تتضمن نتيجة Google Maps المدينة والعنوان.");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("تعذر قراءة إحداثيات المكان.");
  }
  return { formattedAddress, city, countryCode, latitude, longitude };
}

export function getPlacesErrorMessage(status: string, language: "ar" | "en" = "ar"): string {
  if (status === "PERMISSION_DENIED" || status === "API_KEY_INVALID") {
    return language === "ar"
      ? "تعذر استخدام البحث. تحقق من تفعيل Places API (New) وربط المفتاح بتطبيق Android أو iOS."
      : "Place search is unavailable. Enable Places API (New) and restrict the key to the Android or iOS app.";
  }
  if (status === "RESOURCE_EXHAUSTED" || status === "OVER_QUERY_LIMIT") {
    return language === "ar"
      ? "تم بلوغ حد الاستخدام للبحث عن الأماكن. حاول لاحقاً."
      : "The places search quota has been reached. Try again later.";
  }
  return language === "ar" ? "تعذر البحث عن الأماكن. تحقق من الاتصال ثم أعد المحاولة." : "Could not search places. Check your connection and try again.";
}
