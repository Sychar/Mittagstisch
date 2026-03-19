import { Coordinates } from "../types";

const postalCodeMap: Record<string, Coordinates> = {
  "88212": { lat: 47.7811, lng: 9.6125 },
  "88213": { lat: 47.8102, lng: 9.6393 },
  "88045": { lat: 47.6519, lng: 9.4797 },
  "88046": { lat: 47.6688, lng: 9.4771 }
};

export class GeoService {
  getCoordinates(postalCode: string): Coordinates | null {
    return postalCodeMap[postalCode] ?? null;
  }
}

export const haversineKm = (a: Coordinates, b: Coordinates): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return 6371 * c;
};