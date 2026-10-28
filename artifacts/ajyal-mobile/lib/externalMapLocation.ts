type MapLocationInput = {
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

function validCoordinatePair(latitude: unknown, longitude: unknown): latitude is number {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return latitude !== null
    && latitude !== undefined
    && longitude !== null
    && longitude !== undefined
    && Number.isFinite(lat)
    && lat >= -90
    && lat <= 90
    && Number.isFinite(lng)
    && lng >= -180
    && lng <= 180;
}

export function buildExternalMapUrl({ address, latitude, longitude }: MapLocationInput): string | null {
  const query = validCoordinatePair(latitude, longitude)
    ? `${Number(latitude)},${Number(longitude)}`
    : typeof address === "string"
      ? address.trim()
      : "";
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
