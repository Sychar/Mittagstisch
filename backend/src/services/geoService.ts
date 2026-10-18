import { Coordinates } from "../types";

const postalCodeMap: Record<string, Coordinates> = {
  "88212": { lat: 47.7811, lng: 9.6125 },
  "88213": { lat: 47.8102, lng: 9.6393 },
  "88045": { lat: 47.6519, lng: 9.4797 },
  "88046": { lat: 47.6688, lng: 9.4771 }
};

export class GeoService {
  private geocodeCache = new Map<string, Coordinates>();

  getCoordinates(postalCode: string): Coordinates | null {
    return postalCodeMap[postalCode] ?? null;
  }

  async resolveSearchCoordinates(searchText: string): Promise<Coordinates | null> {
    const query = String(searchText || "").trim();
    if (!query) return null;

    const byKnownPostalCode = this.getCoordinates(query);
    if (byKnownPostalCode) return byKnownPostalCode;

    return await this.lookupGenericCoordinates(`${query}, Deutschland`);
  }

  async resolveRestaurantCoordinates(input: {
    address: string;
    postalCode: string;
    lat?: number;
    lng?: number;
  }): Promise<Coordinates | null> {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }

    const byAddress = await this.lookupAddressCoordinates(input.address, input.postalCode);
    if (byAddress) return byAddress;

    return this.getCoordinates(input.postalCode);
  }

  private async lookupAddressCoordinates(
    address: string,
    postalCode: string
  ): Promise<Coordinates | null> {
    const query = `${address}, ${postalCode}, Deutschland`.trim();
    return await this.lookupGenericCoordinates(query);
  }

  private async lookupGenericCoordinates(query: string): Promise<Coordinates | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const cached = this.geocodeCache.get(trimmed);
    if (cached) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "de");
      url.searchParams.set("q", trimmed);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "mittagstisch/1.0 (+admin@bundle.jetzt)",
          Accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>;
      const first = payload?.[0];
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const coordinates = { lat, lng };
      this.geocodeCache.set(trimmed, coordinates);
      return coordinates;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
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
