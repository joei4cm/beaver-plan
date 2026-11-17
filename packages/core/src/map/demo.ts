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
import {
  buildDemoTransitRoute,
  buildDemoWalkOrDrive,
} from "./demo-transit.js";
import { haversineM } from "./polyline.js";

export {
  encodeSimplePolyline,
  decodeSimplePolyline,
  decodeGoogleEncodedPolyline,
  googleEncodedToSimple,
  interpolatePath,
  haversineM,
  pointAlong,
} from "./polyline.js";

/**
 * Demo map engine — curated POIs when Google / Amap / Baidu keys are absent.
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
    if (req.mode === "transit") {
      return buildDemoTransitRoute(req.origin, req.destination, req.language);
    }
    return buildDemoWalkOrDrive(
      req.origin,
      req.destination,
      req.mode,
      !(req.language ?? "zh-CN").toLowerCase().startsWith("en"),
    );
  }
}
