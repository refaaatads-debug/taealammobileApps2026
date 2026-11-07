import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlacesErrorMessage,
  parseAutocompleteSuggestions,
  parsePlaceDetails,
} from "../googlePlaces.ts";

test("autocomplete suggestions include only place predictions with usable IDs", () => {
  const suggestions = parseAutocompleteSuggestions({
    suggestions: [
      { placePrediction: { placeId: "riyadh-1", text: { text: "الرياض، السعودية" } } },
      { queryPrediction: { text: { text: "رياض" } } },
      { placePrediction: { text: { text: "نتيجة بلا معرف" } } },
    ],
  });

  assert.deepEqual(suggestions, [{ placeId: "riyadh-1", description: "الرياض، السعودية" }]);
});

test("place details normalize Saudi city, address, and coordinates", () => {
  assert.deepEqual(parsePlaceDetails({
    formattedAddress: "حي العليا، الرياض، المملكة العربية السعودية",
    location: { latitude: 24.7, longitude: 46.6 },
    addressComponents: [
      { longText: "الرياض", shortText: "الرياض", types: ["locality"] },
      { longText: "المملكة العربية السعودية", shortText: "SA", types: ["country"] },
    ],
  }), {
    formattedAddress: "حي العليا، الرياض، المملكة العربية السعودية",
    city: "الرياض",
    countryCode: "SA",
    latitude: 24.7,
    longitude: 46.6,
  });
});

test("place details reject locations outside Saudi Arabia and invalid coordinates", () => {
  assert.throws(() => parsePlaceDetails({
    formattedAddress: "Amman",
    location: { latitude: 31.9, longitude: 35.9 },
    addressComponents: [{ longText: "Jordan", shortText: "JO", types: ["country"] }],
  }), /داخل المملكة العربية السعودية/);
  assert.throws(() => parsePlaceDetails({
    formattedAddress: "Riyadh",
    location: { latitude: 120, longitude: 46.6 },
    addressComponents: [
      { longText: "Riyadh", types: ["locality"] },
      { longText: "Saudi Arabia", shortText: "SA", types: ["country"] },
    ],
  }), /إحداثيات/);
});

test("Places API errors are translated without exposing response internals", () => {
  assert.match(getPlacesErrorMessage("PERMISSION_DENIED"), /تفعيل Places API/);
  assert.match(getPlacesErrorMessage("RESOURCE_EXHAUSTED"), /حد الاستخدام/);
  assert.match(getPlacesErrorMessage("UNKNOWN"), /تعذر البحث/);
});
