import type {
  Address,
  LatLng,
  MapEngine,
  PlaceDetails,
  PlaceQuery,
  PlaceSummary,
  RouteRequest,
  RouteResult,
  RouteTransitStep,
  RoutingEngine,
} from "../ports.js";
import { encodeSimplePolyline, googleEncodedToSimple } from "./demo.js";

export type GoogleMapsConfig = {
  apiKey: string;
  /** Optional fetch override (Workers / tests). */
  fetch?: typeof fetch;
};

function fetcher(cfg: GoogleMapsConfig): typeof fetch {
  return cfg.fetch ?? fetch;
}

/**
 * Google Places API (New) + Routes API — server-side only.
 * Keys must stay on the BFF; never ship in client bundles.
 */
export class GoogleMapEngine implements MapEngine {
  readonly id = "google" as const;
  readonly mode = "live" as const;
  private readonly key: string;
  private readonly fetch: typeof fetch;

  constructor(cfg: GoogleMapsConfig) {
    this.key = cfg.apiKey;
    this.fetch = fetcher(cfg);
  }

  async searchPlaces(q: PlaceQuery): Promise<PlaceSummary[]> {
    const body: Record<string, unknown> = {
      textQuery: q.text,
      languageCode: q.language ?? "zh-CN",
      maxResultCount: 8,
    };
    if (q.near) {
      body.locationBias = {
        circle: {
          center: { latitude: q.near.lat, longitude: q.near.lng },
          radius: 12000,
        },
      };
    }

    const res = await this.fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error(`google_places_search_${res.status}`);
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };

    const out: PlaceSummary[] = [];
    for (const p of data.places ?? []) {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (lat == null || lng == null || !p.id) continue;
      out.push({
        enginePlaceId: p.id,
        name: p.displayName?.text ?? p.id,
        ...(p.formattedAddress ? { address: p.formattedAddress } : {}),
        lat,
        lng,
      });
    }
    return out;
  }

  async getPlaceDetails(id: string): Promise<PlaceDetails> {
    const placeId = id.startsWith("places/") ? id : `places/${id}`;
    const res = await this.fetch(
      `https://places.googleapis.com/v1/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,location,rating,regularOpeningHours",
        },
      },
    );
    if (!res.ok) throw new Error(`google_place_details_${res.status}`);

    const p = (await res.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      regularOpeningHours?: { weekdayDescriptions?: string[] };
    };

    return {
      enginePlaceId: p.id ?? id,
      name: p.displayName?.text ?? id,
      address: p.formattedAddress,
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      rating: p.rating,
      openingHours: p.regularOpeningHours?.weekdayDescriptions,
      raw: p,
    };
  }

  async reverseGeocode(latLng: LatLng): Promise<Address> {
    const res = await this.fetch(
      "https://maps.googleapis.com/maps/api/geocode/json?" +
        new URLSearchParams({
          latlng: `${latLng.lat},${latLng.lng}`,
          key: this.key,
          language: "zh-CN",
        }),
    );
    if (!res.ok) throw new Error(`google_geocode_${res.status}`);
    const data = (await res.json()) as {
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{
          long_name: string;
          types: string[];
        }>;
      }>;
    };
    const first = data.results?.[0];
    const locality = first?.address_components?.find((c) =>
      c.types.includes("locality"),
    )?.long_name;
    const country = first?.address_components?.find((c) =>
      c.types.includes("country"),
    );
    return {
      formatted: first?.formatted_address ?? `${latLng.lat}, ${latLng.lng}`,
      locality,
      countryCode: country?.long_name,
    };
  }
}

export class GoogleRoutingEngine implements RoutingEngine {
  readonly id = "google" as const;
  readonly mode = "live" as const;
  private readonly key: string;
  private readonly fetch: typeof fetch;

  constructor(cfg: GoogleMapsConfig) {
    this.key = cfg.apiKey;
    this.fetch = fetcher(cfg);
  }

  async route(req: RouteRequest): Promise<RouteResult> {
    const travelMode =
      req.mode === "walk"
        ? "WALK"
        : req.mode === "drive"
          ? "DRIVE"
          : "TRANSIT";

    const res = await this.fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.transitDetails",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: req.origin.lat,
                longitude: req.origin.lng,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: req.destination.lat,
                longitude: req.destination.lng,
              },
            },
          },
          travelMode,
          languageCode: req.language ?? "zh-CN",
        }),
      },
    );

    if (!res.ok) throw new Error(`google_routes_${res.status}`);

    const data = (await res.json()) as {
      routes?: Array<{
        duration?: string;
        distanceMeters?: number;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          steps?: Array<{
            navigationInstruction?: { instructions?: string };
            travelMode?: string;
            staticDuration?: string;
            polyline?: { encodedPolyline?: string };
            transitDetails?: {
              stopDetails?: {
                departureStop?: { name?: string };
                arrivalStop?: { name?: string };
              };
              transitLine?: {
                name?: string;
                nameShort?: string;
                agencies?: Array<{ name?: string }>;
                vehicle?: { type?: string; name?: { text?: string } };
              };
            };
          }>;
        }>;
      }>;
    };

    const route = data.routes?.[0];
    if (!route) {
      return {
        durationSec: 0,
        distanceM: 0,
        transitSteps: [],
      };
    }

    const durationSec = parseDurationSec(route.duration);
    const steps: RouteTransitStep[] = (route.legs?.[0]?.steps ?? []).map(
      (s) => {
        const td = s.transitDetails;
        const line = td?.transitLine;
        const lineName = line?.nameShort || line?.name;
        const agency = line?.agencies?.[0]?.name;
        const vehicleType = line?.vehicle?.type;
        const fromStopName = td?.stopDetails?.departureStop?.name;
        const toStopName = td?.stopDetails?.arrivalStop?.name;
        const mode = s.travelMode ?? travelMode;
        let instruction = s.navigationInstruction?.instructions ?? "";
        if (mode === "TRANSIT" && lineName) {
          const from = fromStopName ?? "?";
          const to = toStopName ?? "?";
          instruction = instruction || `${lineName} · ${from} → ${to}`;
        }
        const stepPoly = googleEncodedToSimple(s.polyline?.encodedPolyline);
        return {
          instruction,
          mode,
          durationSec: parseDurationSec(s.staticDuration),
          ...(lineName ? { lineName } : {}),
          ...(agency ? { agency } : {}),
          ...(vehicleType ? { vehicleType } : {}),
          ...(fromStopName ? { fromStopName } : {}),
          ...(toStopName ? { toStopName } : {}),
          ...(stepPoly ? { polyline: stepPoly } : {}),
        };
      },
    );

    // Prefer simple polyline (from Google encoded) so map can style segments.
    const encoded = route.polyline?.encodedPolyline;
    const polyline =
      googleEncodedToSimple(encoded) ??
      encodeSimplePolyline([req.origin, req.destination]);

    return {
      durationSec,
      distanceM: route.distanceMeters ?? 0,
      polyline,
      transitSteps: steps,
    };
  }
}

function parseDurationSec(value?: string): number {
  if (!value) return 0;
  // Routes API returns e.g. "1234s"
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (m?.[1]) return Math.round(Number(m[1]));
  return 0;
}
