import type { MapEngineId } from "../domain.js";

export type MapEnginePreference = MapEngineId | "auto";

/** Coarse region signal for auto engine selection. */
export type RegionHint = "mainland_cn" | "other";

/**
 * Resolve the active map engine.
 * Product rule: Google default; mainland China → Amap when preference is `auto`.
 * Manual Google / Amap overrides always win.
 */
export function resolveMapEngine(
  preference: MapEnginePreference,
  region: RegionHint,
): MapEngineId {
  if (preference !== "auto") return preference;
  return region === "mainland_cn" ? "amap" : "google";
}

/**
 * Infer region from Cloudflare `cf-ipcountry`, Accept-Language, or timezone.
 * Prefer CF country when present; fall back to language / timezone heuristics.
 */
export function inferRegionHint(input: {
  cfCountry?: string | null;
  acceptLanguage?: string | null;
  timezone?: string | null;
}): RegionHint {
  const country = (input.cfCountry ?? "").toUpperCase();
  if (country === "CN") return "mainland_cn";
  if (country && country !== "XX" && country !== "T1") return "other";

  const tz = (input.timezone ?? "").toLowerCase();
  if (tz.startsWith("asia/shanghai") || tz.startsWith("asia/chongqing") || tz.startsWith("asia/urumqi")) {
    return "mainland_cn";
  }

  const lang = (input.acceptLanguage ?? "").toLowerCase();
  if (lang.startsWith("zh-cn") || lang.startsWith("zh")) {
    // zh alone is ambiguous (TW/HK); only treat explicit zh-CN as mainland.
    if (lang.startsWith("zh-cn") || lang.startsWith("zh-hans")) return "mainland_cn";
  }

  return "other";
}
