export type SavedAddressChoice = {
  id: string;
  city_id: string;
  is_primary: boolean;
};

export function selectSavedAddress(
  addresses: readonly SavedAddressChoice[],
  preferredAddressId: string,
): SavedAddressChoice | null {
  return addresses.find((address) => address.id === preferredAddressId)
    ?? addresses.find((address) => address.is_primary)
    ?? addresses[0]
    ?? null;
}
