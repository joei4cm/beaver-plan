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
import { encodeSimplePolyline } from "./demo.js";

export type BaiduConfig = {
  apiKey: string;
  fetch?: typeof fetch;
};

function fetcher(cfg: BaiduConfig): typeof fetch {
  return cfg.fetch ?? fetch;
}

/**
 * Baidu Maps Web Service adapters — server-side only.
 *
 * Coordinates from Baidu Places / Directions are **BD-09**. Mixing them with
 * Google (WGS84) or Amap (GCJ-02) PlaceRefs without conversion will skew the map.
 * Prefer keeping a trip on one engine after picking stops.
 *
 * Limits vs Google / Amap:
 * - No overseas coverage comparable to Google.
 * - Transit city coverage is mainland-CN oriented; some city pairs need `region`.
 * - Path strings use `lng,lat;…` (same simple polyline we normalize elsewhere).
 */
export class BaiduMapEngine implements MapEngine {
  readonly id = "baidu" as const;
  readonly mode = "live" as const;
  private readonly key: string;
  private readonly fetch: typeof fetch;

  constructor(cfg: BaiduConfig) {
    this.key = cfg.apiKey;
    this.fetch = fetcher(cfg);
  }

  async searchPlaces(q: PlaceQuery): Promise<PlaceSummary[]> {
    const params = new URLSearchParams({
      ak: this.key,
      query: q.text,
      output: "json",
      page_size: "8",
      page_num: "0",
      scope: "1",
    });
    if (q.near) {
      // Baidu location bias: lat,lng (opposite of Amap's lng,lat).
      params.set("location", `${q.near.lat},${q.near.lng}`);
      params.set("radius", "5000");
    } else {
      params.set("region", "全国");
      params.set("city_limit", "false");
    }

    const res = await this.fetch(
      `https://api.map.baidu.com/place/v2/search?${params}`,
    );
    if (!res.ok) throw new Error(`baidu_places_search_${res.status}`);
    const data = (await res.json()) as {
      status?: number;
      message?: string;
      results?: Array<{
        uid?: string;
        name?: string;
        address?: string;
        location?: { lat?: number; lng?: number };
      }>;
    };
    if (data.status !== 0) throw new Error("baidu_places_search_failed");

    const out: PlaceSummary[] = [];
    for (const p of data.results ?? []) {
      const lat = Number(p.location?.lat);
      const lng = Number(p.location?.lng);
      if (!p.uid || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        enginePlaceId: p.uid,
        name: p.name ?? p.uid,
        ...(p.address ? { address: p.address } : {}),
        lat,
        lng,
      });
    }
    return out;
  }

  async getPlaceDetails(id: string): Promise<PlaceDetails> {
    const params = new URLSearchParams({
      ak: this.key,
      uid: id,
      output: "json",
      scope: "2",
    });
    const res = await this.fetch(
      `https://api.map.baidu.com/place/v2/detail?${params}`,
    );
    if (!res.ok) throw new Error(`baidu_place_details_${res.status}`);
    const data = (await res.json()) as {
      status?: number;
      result?: {
        uid?: string;
        name?: string;
        address?: string;
        location?: { lat?: number; lng?: number };
        detail_info?: {
          overall_rating?: string;
          shop_hours?: string;
        };
      };
    };
    const p = data.result;
    const uid = p?.uid;
    if (data.status !== 0 || !p || !uid) {
      throw new Error("baidu_place_not_found");
    }
    const hours = p.detail_info?.shop_hours
      ? [p.detail_info.shop_hours]
      : undefined;
    const rating = p.detail_info?.overall_rating
      ? Number(p.detail_info.overall_rating)
      : undefined;
    return {
      enginePlaceId: uid,
      name: p.name ?? uid,
      address: p.address || undefined,
      lat: Number(p.location?.lat) || 0,
      lng: Number(p.location?.lng) || 0,
      ...(Number.isFinite(rating) ? { rating } : {}),
      ...(hours ? { openingHours: hours } : {}),
      raw: p,
    };
  }

  async reverseGeocode(latLng: LatLng): Promise<Address> {
    const params = new URLSearchParams({
      ak: this.key,
      output: "json",
      // Callers using Baidu PlaceRefs pass BD-09; document coordtype if mixing.
      coordtype: "bd09ll",
      location: `${latLng.lat},${latLng.lng}`,
    });
    const res = await this.fetch(
      `https://api.map.baidu.com/reverse_geocoding/v3/?${params}`,
    );
    if (!res.ok) throw new Error(`baidu_regeo_${res.status}`);
    const data = (await res.json()) as {
      status?: number;
      result?: {
        formatted_address?: string;
        addressComponent?: {
          city?: string;
          province?: string;
          country?: string;
          country_code_iso?: string;
        };
      };
    };
    if (data.status !== 0) throw new Error("baidu_regeo_failed");
    const ac = data.result?.addressComponent;
    return {
      formatted:
        data.result?.formatted_address ??
        `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`,
      locality: ac?.city || ac?.province,
      countryCode: ac?.country_code_iso || ac?.country,
    };
  }
}

export class BaiduRoutingEngine implements RoutingEngine {
  readonly id = "baidu" as const;
  readonly mode = "live" as const;
  private readonly key: string;
  private readonly fetch: typeof fetch;

  constructor(cfg: BaiduConfig) {
    this.key = cfg.apiKey;
    this.fetch = fetcher(cfg);
  }

  async route(req: RouteRequest): Promise<RouteResult> {
    const origin = `${req.origin.lat},${req.origin.lng}`;
    const destination = `${req.destination.lat},${req.destination.lng}`;

    if (req.mode === "walk") {
      return this.routeLite(
        "walking",
        origin,
        destination,
        req,
        "WALK",
      );
    }
    if (req.mode === "drive") {
      return this.routeLite(
        "driving",
        origin,
        destination,
        req,
        "DRIVE",
      );
    }
    return this.routeTransit(origin, destination, req);
  }

  private async routeLite(
    kind: "walking" | "driving",
    origin: string,
    destination: string,
    req: RouteRequest,
    modeLabel: string,
  ): Promise<RouteResult> {
    const params = new URLSearchParams({
      ak: this.key,
      origin,
      destination,
    });
    const res = await this.fetch(
      `https://api.map.baidu.com/directionlite/v1/${kind}?${params}`,
    );
    if (!res.ok) throw new Error(`baidu_route_${res.status}`);
    const data = (await res.json()) as {
      status?: number;
      result?: {
        routes?: Array<{
          distance?: number;
          duration?: number;
          steps?: Array<{
            instruction?: string;
            path?: string;
            distance?: number;
            duration?: number;
          }>;
        }>;
      };
    };
    if (data.status !== 0) throw new Error("baidu_route_failed");
    const route = data.result?.routes?.[0];
    if (!route) {
      return {
        durationSec: 0,
        distanceM: 0,
        polyline: encodeSimplePolyline([req.origin, req.destination]),
        transitSteps: [],
      };
    }

    const points: LatLng[] = [req.origin];
    const transitSteps: RouteResult["transitSteps"] = [];
    for (const step of route.steps ?? []) {
      appendBaiduPath(points, step.path);
      transitSteps.push({
        instruction: stripHtml(step.instruction) || modeLabel,
        mode: modeLabel,
        ...(step.duration != null ? { durationSec: Number(step.duration) } : {}),
      });
    }
    points.push(req.destination);

    return {
      durationSec: Number(route.duration) || 0,
      distanceM: Number(route.distance) || 0,
      polyline: encodeSimplePolyline(points),
      transitSteps,
    };
  }

  private async routeTransit(
    origin: string,
    destination: string,
    req: RouteRequest,
  ): Promise<RouteResult> {
    const params = new URLSearchParams({
      ak: this.key,
      origin,
      destination,
    });
    const res = await this.fetch(
      `https://api.map.baidu.com/directionlite/v1/transit?${params}`,
    );
    if (!res.ok) throw new Error(`baidu_transit_${res.status}`);
    const data = (await res.json()) as {
      status?: number;
      result?: {
        routes?: Array<{
          distance?: number;
          duration?: number;
          steps?: Array<
            Array<{
              instruction?: string;
              path?: string;
              distance?: number;
              duration?: number;
              start_location?: { lat?: number; lng?: number };
              end_location?: { lat?: number; lng?: number };
              vehicle_info?: {
                type?: number;
                detail?: {
                  name?: string;
                  type?: string;
                  stop_name?: string;
                  arrival_stop?: string;
                  departure_stop?: string;
                };
              };
            }>
          >;
        }>;
      };
    };
    if (data.status !== 0) throw new Error("baidu_transit_failed");

    const route = data.result?.routes?.[0];
    if (!route) {
      return this.route({ ...req, mode: "walk" });
    }

    const polyPoints: LatLng[] = [req.origin];
    const transitSteps: RouteResult["transitSteps"] = [];

    for (const segment of route.steps ?? []) {
      for (const step of segment) {
        const type = step.vehicle_info?.type ?? 1;
        const detail = step.vehicle_info?.detail;
        const stepPts: LatLng[] = [];
        appendBaiduPath(stepPts, step.path);
        appendBaiduPath(polyPoints, step.path);

        if (type === 1 || type === 2) {
          // 1 walk, 2 bike — treat as walk for planner styling.
          transitSteps.push({
            instruction: stripHtml(step.instruction) || "Walk",
            mode: "WALK",
            ...(step.duration != null
              ? { durationSec: Number(step.duration) }
              : {}),
            ...(stepPts.length >= 2
              ? { polyline: encodeSimplePolyline(stepPts) }
              : {}),
          });
          continue;
        }

        const lineName = detail?.name ?? "Transit";
        const fromStop =
          detail?.departure_stop ?? detail?.stop_name ?? undefined;
        const toStop = detail?.arrival_stop ?? undefined;
        transitSteps.push({
          instruction: fromStop && toStop
            ? `${lineName} · ${fromStop} → ${toStop}`
            : stripHtml(step.instruction) || lineName,
          mode: "TRANSIT",
          ...(step.duration != null
            ? { durationSec: Number(step.duration) }
            : {}),
          lineName,
          agency: "Baidu",
          vehicleType: baiduVehicleType(type, detail?.type),
          ...(fromStop ? { fromStopName: fromStop } : {}),
          ...(toStop ? { toStopName: toStop } : {}),
          ...(stepPts.length >= 2
            ? { polyline: encodeSimplePolyline(stepPts) }
            : {}),
        });
      }
    }
    polyPoints.push(req.destination);

    return {
      durationSec: Number(route.duration) || 0,
      distanceM: Number(route.distance) || 0,
      polyline: encodeSimplePolyline(polyPoints),
      transitSteps,
    };
  }
}

/** Baidu directionlite path: `lng,lat;lng,lat;…` */
function appendBaiduPath(points: LatLng[], path?: string) {
  if (!path) return;
  for (const part of path.split(";")) {
    const [lngS, latS] = part.split(",");
    const lat = Number(latS);
    const lng = Number(lngS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push({ lat, lng });
    }
  }
}

function stripHtml(s?: string): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").trim();
}

function baiduVehicleType(
  type: number,
  detailType?: string,
): string {
  if (detailType) return detailType.toUpperCase();
  switch (type) {
    case 3:
      return "BUS";
    case 5:
      return "SUBWAY";
    case 6:
      return "AIRCRAFT";
    case 7:
      return "TRAIN";
    default:
      return "TRANSIT";
  }
}
