export type SavedAddressChoice = {
  id: string;
  city_id: string;
  is_primary: boolean;
  created_at?: string | null;
};

export function selectSavedAddress(
  addresses: readonly SavedAddressChoice[],
  preferredAddressId: string,
): SavedAddressChoice | null {
  return addresses.find((address) => address.id === preferredAddressId)
    ?? [...addresses].sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NaN;
      const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NaN;
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return rightTime - leftTime;
      if (Number.isFinite(rightTime)) return 1;
      if (Number.isFinite(leftTime)) return -1;
      return Number(right.is_primary) - Number(left.is_primary);
    })[0]
    ?? null;
}
