import type { MapEngineId } from "../domain.js";
import type { MapEngine, RoutingEngine } from "../ports.js";
import { AmapMapEngine, AmapRoutingEngine } from "./amap.js";
import { DemoMapEngine, DemoRoutingEngine } from "./demo.js";
import { GoogleMapEngine, GoogleRoutingEngine } from "./google.js";

export type MapKeyBag = {
  googleServerKey?: string;
  amapServerKey?: string;
  fetch?: typeof fetch;
};

export type EngineBundle = {
  map: MapEngine;
  routing: RoutingEngine;
  /** `live` when the matching vendor key is present; otherwise demo. */
  mode: "live" | "demo";
  engineId: MapEngineId;
};

/**
 * Build Map + Routing engines for the resolved engine id.
 * Missing keys → Demo adapters (same PlaceRef / Leg shapes).
 */
export function createEngineBundle(
  engineId: MapEngineId,
  keys: MapKeyBag,
): EngineBundle {
  if (engineId === "google" && keys.googleServerKey) {
    const cfg = { apiKey: keys.googleServerKey, fetch: keys.fetch };
    return {
      map: new GoogleMapEngine(cfg),
      routing: new GoogleRoutingEngine(cfg),
      mode: "live",
      engineId,
    };
  }
  if (engineId === "amap" && keys.amapServerKey) {
    const cfg = { apiKey: keys.amapServerKey, fetch: keys.fetch };
    return {
      map: new AmapMapEngine(cfg),
      routing: new AmapRoutingEngine(cfg),
      mode: "live",
      engineId,
    };
  }
  return {
    map: new DemoMapEngine(engineId),
    routing: new DemoRoutingEngine(engineId),
    mode: "demo",
    engineId,
  };
}
