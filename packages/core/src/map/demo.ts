import type { MapEngineId } from "../domain.js";
import type {
  Address,
  LatLng,
  MapEngine,
  PlaceDetails,
  PlaceQuery,
  PlaceSummary,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from "../ports.js";
import { DEMO_PLACES, searchDemoPlaces } from "./demo-data.js";

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Simple lat,lng;lat,lng polyline for demo / cross-engine legs. */
export function encodeSimplePolyline(points: LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
}

export function decodeSimplePolyline(polyline: string): LatLng[] {
  return polyline
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [latS, lngS] = part.split(",");
      return { lat: Number(latS), lng: Number(lngS) };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/**
 * Demo map engine — curated POIs when Google / Amap keys are absent.
 * Tagged with the preferred engine id so PlaceRefs stay honest about "mode".
 */
export class DemoMapEngine implements MapEngine {
  readonly id: MapEngineId;
  readonly mode = "demo" as const;

  constructor(id: MapEngineId = "google") {
    this.id = id;
  }

  async searchPlaces(q: PlaceQuery): Promise<PlaceSummary[]> {
    return searchDemoPlaces(q.text);
  }

  async getPlaceDetails(id: string): Promise<PlaceDetails> {
    const found = DEMO_PLACES.find((p) => p.enginePlaceId === id);
    if (found) {
      return {
        ...found,
        rating: 4.6,
        openingHours: ["09:00–17:00"],
        raw: { demo: true },
      };
    }
    return {
      enginePlaceId: id,
      name: "Demo place",
      lat: 35.0116,
      lng: 135.7681,
      raw: { demo: true },
    };
  }

  async reverseGeocode(latLng: LatLng): Promise<Address> {
    let nearest = DEMO_PLACES[0]!;
    let best = Number.POSITIVE_INFINITY;
    for (const p of DEMO_PLACES) {
      const d = haversineM(latLng, p);
      if (d < best) {
        best = d;
        nearest = p;
      }
    }
    return {
      formatted:
        best < 800
          ? (nearest.address ?? nearest.name)
          : `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`,
      locality: nearest.name,
    };
  }
}

export class DemoRoutingEngine implements RoutingEngine {
  readonly id: MapEngineId;
  readonly mode = "demo" as const;

  constructor(id: MapEngineId = "google") {
    this.id = id;
  }

  async route(req: RouteRequest): Promise<RouteResult> {
    const distanceM = Math.round(haversineM(req.origin, req.destination));
    const speedMps =
      req.mode === "walk" ? 1.35 : req.mode === "transit" ? 6.5 : 11;
    const durationSec = Math.max(60, Math.round(distanceM / speedMps));
    const mid: LatLng = {
      lat: (req.origin.lat + req.destination.lat) / 2,
      lng: (req.origin.lng + req.destination.lng) / 2,
    };
    const transitSteps =
      req.mode === "transit"
        ? [
            {
              instruction: "Walk to nearest station (demo)",
              mode: "WALK",
              durationSec: Math.round(durationSec * 0.2),
            },
            {
              instruction: "Transit toward destination (demo)",
              mode: "TRANSIT",
              durationSec: Math.round(durationSec * 0.6),
            },
            {
              instruction: "Walk to stop (demo)",
              mode: "WALK",
              durationSec: Math.round(durationSec * 0.2),
            },
          ]
        : [
            {
              instruction:
                req.mode === "walk" ? "Walk along demo path" : "Drive demo route",
              mode: req.mode.toUpperCase(),
              durationSec,
            },
          ];

    return {
      durationSec,
      distanceM,
      polyline: encodeSimplePolyline([req.origin, mid, req.destination]),
      transitSteps,
    };
  }
}
