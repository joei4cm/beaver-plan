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

export type AmapConfig = {
  apiKey: string;
  fetch?: typeof fetch;
};

function fetcher(cfg: AmapConfig): typeof fetch {
  return cfg.fetch ?? fetch;
}

/**
 * Amap (高德) REST adapters — server-side only.
 * Web key restrictions differ from server keys; keep secrets on Workers.
 */
export class AmapMapEngine implements MapEngine {
  readonly id = "amap" as const;
  readonly mode = "live" as const;
  private readonly key: string;
  private readonly fetch: typeof fetch;

  constructor(cfg: AmapConfig) {
    this.key = cfg.apiKey;
    this.fetch = fetcher(cfg);
  }

  async searchPlaces(q: PlaceQuery): Promise<PlaceSummary[]> {
    const params = new URLSearchParams({
      key: this.key,
      keywords: q.text,
      offset: "8",
      page: "1",
      extensions: "base",
      language: q.language === "en" ? "en" : "zh_cn",
    });
    if (q.near) {
      params.set("location", `${q.near.lng},${q.near.lat}`);
      params.set("sortrule", "distance");
    }

    const res = await this.fetch(
      `https://restapi.amap.com/v3/place/text?${params}`,
    );
    if (!res.ok) throw new Error(`amap_places_search_${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      pois?: Array<{
        id?: string;
        name?: string;
        address?: string | string[];
        location?: string;
      }>;
    };
    if (data.status !== "1") throw new Error("amap_places_search_failed");

    const out: PlaceSummary[] = [];
    for (const p of data.pois ?? []) {
      const [lngS, latS] = (p.location ?? "").split(",");
      const lat = Number(latS);
      const lng = Number(lngS);
      if (!p.id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const address = Array.isArray(p.address)
        ? p.address.join("")
        : p.address;
      out.push({
        enginePlaceId: p.id,
        name: p.name ?? p.id,
        ...(address ? { address } : {}),
        lat,
        lng,
      });
    }
    return out;
  }

  async getPlaceDetails(id: string): Promise<PlaceDetails> {
    const params = new URLSearchParams({
      key: this.key,
      id,
      extensions: "all",
    });
    const res = await this.fetch(
      `https://restapi.amap.com/v3/place/detail?${params}`,
    );
    if (!res.ok) throw new Error(`amap_place_details_${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      pois?: Array<{
        id?: string;
        name?: string;
        address?: string | string[];
        location?: string;
        biz_ext?: { rating?: string };
        opentime_today?: string;
        opentime_week?: string;
      }>;
    };
    const p = data.pois?.[0];
    if (!p?.id) throw new Error("amap_place_not_found");
    const [lngS, latS] = (p.location ?? "").split(",");
    const address = Array.isArray(p.address) ? p.address.join("") : p.address;
    const hours = [p.opentime_today, p.opentime_week].filter(
      (h): h is string => Boolean(h),
    );
    return {
      enginePlaceId: p.id,
      name: p.name ?? p.id,
      address: address || undefined,
      lat: Number(latS) || 0,
      lng: Number(lngS) || 0,
      rating: p.biz_ext?.rating ? Number(p.biz_ext.rating) : undefined,
      openingHours: hours.length ? hours : undefined,
      raw: p,
    };
  }

  async reverseGeocode(latLng: LatLng): Promise<Address> {
    const params = new URLSearchParams({
      key: this.key,
      location: `${latLng.lng},${latLng.lat}`,
      extensions: "base",
    });
    const res = await this.fetch(
      `https://restapi.amap.com/v3/geocode/regeo?${params}`,
    );
    if (!res.ok) throw new Error(`amap_regeo_${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      regeocode?: {
        formatted_address?: string;
        addressComponent?: {
          city?: string | string[];
          province?: string;
          country?: string;
        };
      };
    };
    const city = data.regeocode?.addressComponent?.city;
    const locality = Array.isArray(city) ? city[0] : city;
    return {
      formatted:
        data.regeocode?.formatted_address ??
        `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`,
      locality: locality || data.regeocode?.addressComponent?.province,
      countryCode: data.regeocode?.addressComponent?.country,
    };
  }
}

export class AmapRoutingEngine implements RoutingEngine {
  readonly id = "amap" as const;
  readonly mode = "live" as const;
  private readonly key: string;
  private readonly fetch: typeof fetch;

  constructor(cfg: AmapConfig) {
    this.key = cfg.apiKey;
    this.fetch = fetcher(cfg);
  }

  async route(req: RouteRequest): Promise<RouteResult> {
    const origin = `${req.origin.lng},${req.origin.lat}`;
    const destination = `${req.destination.lng},${req.destination.lat}`;

    if (req.mode === "walk") {
      return this.routePath(
        `https://restapi.amap.com/v3/direction/walking?` +
          new URLSearchParams({ key: this.key, origin, destination }),
        req,
        "WALK",
      );
    }

    if (req.mode === "drive") {
      return this.routePath(
        `https://restapi.amap.com/v3/direction/driving?` +
          new URLSearchParams({ key: this.key, origin, destination }),
        req,
        "DRIVE",
      );
    }

    // Transit (integrated)
    const params = new URLSearchParams({
      key: this.key,
      origin,
      destination,
      city: "010", // Amap requires a city code; BFF may override via query later
      strategy: "0",
    });
    const res = await this.fetch(
      `https://restapi.amap.com/v3/direction/transit/integrated?${params}`,
    );
    if (!res.ok) throw new Error(`amap_transit_${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      route?: {
        transits?: Array<{
          duration?: string;
          distance?: string;
          segments?: Array<{
            walking?: {
              distance?: string;
              duration?: string;
              steps?: Array<{ instruction?: string; polyline?: string }>;
            };
            bus?: {
              buslines?: Array<{
                name?: string;
                departure_stop?: { name?: string };
                arrival_stop?: { name?: string };
                duration?: string;
                distance?: string;
                polyline?: string;
              }>;
            };
          }>;
        }>;
      };
    };
    if (data.status !== "1") throw new Error("amap_transit_failed");

    const transit = data.route?.transits?.[0];
    if (!transit) {
      // Fall back to walking if no transit plan.
      return this.route(
        { ...req, mode: "walk" },
      );
    }

    const durationSec = Number(transit.duration) || 0;
    const distanceM = Number(transit.distance) || 0;
    const transitSteps: RouteResult["transitSteps"] = [];
    const polyPoints: LatLng[] = [req.origin];

    for (const seg of transit.segments ?? []) {
      if (seg.walking?.steps) {
        for (const step of seg.walking.steps) {
          transitSteps.push({
            instruction: step.instruction ?? "Walk",
            mode: "WALK",
            durationSec: undefined,
          });
          appendAmapPolyline(polyPoints, step.polyline);
        }
      }
      const line = seg.bus?.buslines?.[0];
      if (line) {
        transitSteps.push({
          instruction: `${line.name ?? "Transit"} · ${line.departure_stop?.name ?? "?"} → ${line.arrival_stop?.name ?? "?"}`,
          mode: "TRANSIT",
          durationSec: line.duration ? Number(line.duration) : undefined,
        });
        appendAmapPolyline(polyPoints, line.polyline);
      }
    }
    polyPoints.push(req.destination);

    return {
      durationSec,
      distanceM,
      polyline: encodeSimplePolyline(polyPoints),
      transitSteps,
    };
  }

  private async routePath(
    url: string,
    req: RouteRequest,
    modeLabel: string,
  ): Promise<RouteResult> {
    const res = await this.fetch(url);
    if (!res.ok) throw new Error(`amap_route_${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      route?: {
        paths?: Array<{
          distance?: string;
          duration?: string;
          steps?: Array<{ instruction?: string; polyline?: string }>;
        }>;
      };
    };
    if (data.status !== "1") throw new Error("amap_route_failed");
    const path = data.route?.paths?.[0];
    if (!path) {
      return {
        durationSec: 0,
        distanceM: 0,
        polyline: encodeSimplePolyline([req.origin, req.destination]),
        transitSteps: [],
      };
    }
    const points: LatLng[] = [req.origin];
    for (const step of path.steps ?? []) {
      appendAmapPolyline(points, step.polyline);
    }
    points.push(req.destination);

    return {
      durationSec: Number(path.duration) || 0,
      distanceM: Number(path.distance) || 0,
      polyline: encodeSimplePolyline(points),
      transitSteps: (path.steps ?? []).map((s) => ({
        instruction: s.instruction ?? modeLabel,
        mode: modeLabel,
      })),
    };
  }
}

function appendAmapPolyline(points: LatLng[], polyline?: string) {
  if (!polyline) return;
  for (const part of polyline.split(";")) {
    const [lngS, latS] = part.split(",");
    const lat = Number(latS);
    const lng = Number(lngS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push({ lat, lng });
    }
  }
}
