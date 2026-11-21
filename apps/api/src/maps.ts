import { Hono } from "hono";
import {
  createEngineBundle,
  DEMO_PLACE_TAGS,
  DemoMapEngine,
  DemoRoutingEngine,
  getDemoPlaceDetails,
  inferRegionHint,
  resolveMapEngine,
  type MapEnginePreference,
  type LatLng,
} from "@beaver/core";
import type { Bindings } from "./env.js";

export const mapsRoutes = new Hono<{ Bindings: Bindings }>();

function preferenceFrom(
  raw: string | undefined,
  fallback: string,
): MapEnginePreference {
  const v = (raw ?? fallback ?? "auto").toLowerCase();
  if (v === "google" || v === "amap" || v === "baidu" || v === "auto") {
    return v;
  }
  return "auto";
}

function keysFrom(env: Bindings) {
  return {
    googleServerKey: env.GOOGLE_MAPS_SERVER_KEY,
    amapServerKey: env.AMAP_SERVER_KEY,
    baiduServerKey: env.BAIDU_MAP_SERVER_KEY,
  };
}

function bundleFor(
  c: { env: Bindings; req: { header: (n: string) => string | undefined } },
  preference: MapEnginePreference,
  timezone?: string | null,
) {
  const autoEnabled = (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false";
  const region = autoEnabled
    ? inferRegionHint({
        cfCountry: c.req.header("cf-ipcountry"),
        acceptLanguage: c.req.header("accept-language"),
        timezone,
      })
    : ("other" as const);
  const engineId = resolveMapEngine(preference, region);
  const bundle = createEngineBundle(engineId, keysFrom(c.env));
  return { ...bundle, region, preference };
}

/** Resolve which engine would be used (for settings UI). */
mapsRoutes.get("/v1/maps/engine", (c) => {
  const preference = preferenceFrom(
    c.req.query("preference"),
    c.env.DEFAULT_MAP_ENGINE,
  );
  const resolved = bundleFor(c, preference, c.req.query("timezone"));
  return c.json({
    preference: resolved.preference,
    region: resolved.region,
    engineId: resolved.engineId,
    mode: resolved.mode,
    autoAmapCn: (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false",
  });
});

mapsRoutes.get("/v1/places/search", async (c) => {
  const text = (c.req.query("q") ?? "").trim();
  if (!text) return c.json({ error: "q_required" }, 400);

  const preference = preferenceFrom(
    c.req.query("engine"),
    c.env.DEFAULT_MAP_ENGINE,
  );
  const nearLat = c.req.query("lat");
  const nearLng = c.req.query("lng");
  const near =
    nearLat && nearLng
      ? { lat: Number(nearLat), lng: Number(nearLng) }
      : undefined;

  const { map, mode, engineId, region } = bundleFor(
    c,
    preference,
    c.req.query("timezone"),
  );

  const query = {
    text,
    near:
      near && Number.isFinite(near.lat) && Number.isFinite(near.lng)
        ? near
        : undefined,
    language: c.req.query("language") ?? "zh-CN",
  };

  try {
    const places = await map.searchPlaces(query);
    return c.json({ places, engineId, mode, region });
  } catch (err) {
    // Soft-fail live vendor outages → curated demo POIs (never empty stub).
    if (mode === "live") {
      const demo = new DemoMapEngine(engineId);
      const places = await demo.searchPlaces(query);
      return c.json({
        places,
        engineId,
        mode: "demo" as const,
        region,
        fallback: "demo_after_live_error",
        liveError: err instanceof Error ? err.message : "search_failed",
      });
    }
    const message = err instanceof Error ? err.message : "search_failed";
    return c.json({ error: message, engineId, mode }, 502);
  }
});

mapsRoutes.get("/v1/places/:id", async (c) => {
  const preference = preferenceFrom(
    c.req.query("engine"),
    c.env.DEFAULT_MAP_ENGINE,
  );
  const language = c.req.query("language") ?? undefined;
  const { map, mode, engineId } = bundleFor(
    c,
    preference,
    c.req.query("timezone"),
  );
  const id = c.req.param("id");
  try {
    const place =
      mode === "demo"
        ? getDemoPlaceDetails(id, language, DEMO_PLACE_TAGS[id])
        : await map.getPlaceDetails(id);
    return c.json({ place, engineId, mode });
  } catch (err) {
    // Soft-fail live vendor outages → curated demo intel (never hard-fail UI).
    if (mode === "live") {
      return c.json({
        place: getDemoPlaceDetails(id, language, DEMO_PLACE_TAGS[id]),
        engineId,
        mode: "demo" as const,
        fallback: "demo_after_live_error",
        liveError: err instanceof Error ? err.message : "details_failed",
      });
    }
    const message = err instanceof Error ? err.message : "details_failed";
    return c.json({ error: message, engineId, mode }, 502);
  }
});

mapsRoutes.get("/v1/geocode/reverse", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat_lng_required" }, 400);
  }
  const preference = preferenceFrom(
    c.req.query("engine"),
    c.env.DEFAULT_MAP_ENGINE,
  );
  const { map, mode, engineId } = bundleFor(
    c,
    preference,
    c.req.query("timezone"),
  );
  try {
    const address = await map.reverseGeocode({ lat, lng });
    return c.json({ address, engineId, mode });
  } catch (err) {
    if (mode === "live") {
      const demo = new DemoMapEngine(engineId);
      const address = await demo.reverseGeocode({ lat, lng });
      return c.json({
        address,
        engineId,
        mode: "demo" as const,
        fallback: "demo_after_live_error",
      });
    }
    const message = err instanceof Error ? err.message : "geocode_failed";
    return c.json({ error: message, engineId, mode }, 502);
  }
});

type DirectionsBody = {
  origin: LatLng;
  destination: LatLng;
  mode?: "walk" | "transit" | "drive";
  engine?: MapEnginePreference;
  language?: string;
  timezone?: string;
};

mapsRoutes.post("/v1/directions", async (c) => {
  let body: DirectionsBody;
  try {
    body = await c.req.json<DirectionsBody>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (
    !body.origin ||
    !body.destination ||
    !Number.isFinite(body.origin.lat) ||
    !Number.isFinite(body.origin.lng) ||
    !Number.isFinite(body.destination.lat) ||
    !Number.isFinite(body.destination.lng)
  ) {
    return c.json({ error: "origin_destination_required" }, 400);
  }

  const preference = preferenceFrom(
    body.engine,
    c.env.DEFAULT_MAP_ENGINE,
  );
  const { routing, mode, engineId, region } = bundleFor(
    c,
    preference,
    body.timezone,
  );

  const req = {
    origin: body.origin,
    destination: body.destination,
    mode: body.mode ?? ("walk" as const),
    language: body.language ?? "zh-CN",
  };

  try {
    const route = await routing.route(req);
    return c.json({ route, engineId, mode, region });
  } catch (err) {
    if (mode === "live") {
      const demo = new DemoRoutingEngine(engineId);
      const route = await demo.route(req);
      return c.json({
        route,
        engineId,
        mode: "demo" as const,
        region,
        fallback: "demo_after_live_error",
      });
    }
    const message = err instanceof Error ? err.message : "directions_failed";
    return c.json({ error: message, engineId, mode }, 502);
  }
});
