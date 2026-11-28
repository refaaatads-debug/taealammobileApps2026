export type SavedAddressSummaryRow = { city_id: string; is_primary?: boolean };
export function savedAddressSummary(addresses: SavedAddressSummaryRow[], cities: {id:string;name_ar:string}[]) {
  const ordered = [...addresses].sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary)));
  const names = [...new Set(ordered.map(row=>cities.find(city=>city.id===row.city_id)?.name_ar?.trim()).filter((name): name is string=>Boolean(name)))];
  return { count: addresses.length, cityNames: names.join("، ") };
}
export function savedAddressCountText(count: number, language: "ar" | "en"): string {
  if (language === "en") return count === 1 ? "1 saved address" : `${count} saved addresses`;
  if (count === 1) return "لديك عنوان محفوظ";
  if (count === 2) return "لديك عنوانان محفوظان";
  return `لديك ${count} عناوين محفوظة`;
}
