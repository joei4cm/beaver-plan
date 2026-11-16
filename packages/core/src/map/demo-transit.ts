import type { TransitStep } from "../domain.js";
import type { LatLng, RouteResult } from "../ports.js";
import {
  encodeSimplePolyline,
  haversineM,
  interpolatePath,
  pointAlong,
} from "./polyline.js";

type ScriptedTransit = {
  /** Match when both ends are near these coords (meters). */
  originNear: LatLng;
  destNear: LatLng;
  radiusM: number;
  build: (origin: LatLng, dest: LatLng, zh: boolean) => RouteResult;
};

function walkStep(
  instruction: string,
  from: LatLng,
  to: LatLng,
  durationSec: number,
): TransitStep {
  return {
    instruction,
    mode: "WALK",
    durationSec,
    polyline: encodeSimplePolyline(interpolatePath(from, to, 3)),
  };
}

function transitStep(opts: {
  instruction: string;
  lineName: string;
  agency: string;
  vehicleType: string;
  fromStopName: string;
  toStopName: string;
  from: LatLng;
  to: LatLng;
  durationSec: number;
}): TransitStep {
  return {
    instruction: opts.instruction,
    mode: "TRANSIT",
    durationSec: opts.durationSec,
    lineName: opts.lineName,
    agency: opts.agency,
    vehicleType: opts.vehicleType,
    fromStopName: opts.fromStopName,
    toStopName: opts.toStopName,
    polyline: encodeSimplePolyline(interpolatePath(opts.from, opts.to, 6)),
  };
}

function transferStep(
  instruction: string,
  at: LatLng,
  durationSec: number,
): TransitStep {
  const nudge = { lat: at.lat + 0.0002, lng: at.lng + 0.0002 };
  return {
    instruction,
    mode: "TRANSFER",
    durationSec,
    polyline: encodeSimplePolyline([at, nudge, at]),
  };
}

function assemble(
  steps: TransitStep[],
  origin: LatLng,
  dest: LatLng,
): RouteResult {
  const durationSec = steps.reduce((s, x) => s + (x.durationSec ?? 0), 0);
  const distanceM = Math.round(haversineM(origin, dest));
  const polyPts: LatLng[] = [origin];
  for (const step of steps) {
    if (!step.polyline) continue;
    for (const part of step.polyline.split(";")) {
      const [latS, lngS] = part.split(",");
      const lat = Number(latS);
      const lng = Number(lngS);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        polyPts.push({ lat, lng });
      }
    }
  }
  polyPts.push(dest);
  return {
    durationSec,
    distanceM: Math.max(distanceM, 200),
    polyline: encodeSimplePolyline(polyPts),
    transitSteps: steps,
  };
}

/** Kiyomizu → Gion: short bus hop with walks. */
function kiyomizuToGion(
  origin: LatLng,
  dest: LatLng,
  zh: boolean,
): RouteResult {
  const busStopA = pointAlong(origin, dest, 0.18);
  const busStopB = pointAlong(origin, dest, 0.82);
  const steps: TransitStep[] = [
    walkStep(
      zh ? "步行至清水道巴士站" : "Walk to Kiyomizu-michi bus stop",
      origin,
      busStopA,
      7 * 60,
    ),
    transitStep({
      instruction: zh
        ? "市巴士 100／206 线 · 清水道 → 祇园"
        : "City Bus 100/206 · Kiyomizu-michi → Gion",
      lineName: zh ? "市巴士 100／206" : "City Bus 100/206",
      agency: zh ? "京都市交通局" : "Kyoto City Bus",
      vehicleType: "BUS",
      fromStopName: zh ? "清水道" : "Kiyomizu-michi",
      toStopName: zh ? "祇园" : "Gion",
      from: busStopA,
      to: busStopB,
      durationSec: 9 * 60,
    }),
    walkStep(
      zh ? "步行至祗园巷口" : "Walk into Gion lanes",
      busStopB,
      dest,
      6 * 60,
    ),
  ];
  return assemble(steps, origin, dest);
}

/** Fushimi Inari → Arashiyama: JR transfer via Kyoto. */
function fushimiToArashiyama(
  origin: LatLng,
  dest: LatLng,
  zh: boolean,
): RouteResult {
  const inari = pointAlong(origin, dest, 0.06);
  const kyoto = { lat: 34.9858, lng: 135.7588 };
  const saga = pointAlong(kyoto, dest, 0.85);
  const steps: TransitStep[] = [
    walkStep(
      zh ? "步行至稻荷站" : "Walk to Inari Station",
      origin,
      inari,
      8 * 60,
    ),
    transitStep({
      instruction: zh
        ? "JR 奈良线 · 稻荷 → 京都"
        : "JR Nara Line · Inari → Kyoto",
      lineName: zh ? "JR 奈良线" : "JR Nara Line",
      agency: zh ? "JR西日本" : "JR West",
      vehicleType: "TRAIN",
      fromStopName: zh ? "稻荷" : "Inari",
      toStopName: zh ? "京都" : "Kyoto",
      from: inari,
      to: kyoto,
      durationSec: 7 * 60,
    }),
    transferStep(
      zh ? "京都站换乘 · 步行至嵯峨野线月台" : "Transfer at Kyoto · walk to Sagano platforms",
      kyoto,
      6 * 60,
    ),
    transitStep({
      instruction: zh
        ? "JR 嵯峨野线 · 京都 → 嵯峨岚山"
        : "JR Sagano Line · Kyoto → Saga-Arashiyama",
      lineName: zh ? "JR 嵯峨野线" : "JR Sagano Line",
      agency: zh ? "JR西日本" : "JR West",
      vehicleType: "TRAIN",
      fromStopName: zh ? "京都" : "Kyoto",
      toStopName: zh ? "嵯峨岚山" : "Saga-Arashiyama",
      from: kyoto,
      to: saga,
      durationSec: 16 * 60,
    }),
    walkStep(
      zh ? "步行至岚山竹林入口" : "Walk to the bamboo grove entrance",
      saga,
      dest,
      10 * 60,
    ),
  ];
  return assemble(steps, origin, dest);
}

const SCRIPTS: ScriptedTransit[] = [
  {
    originNear: { lat: 34.9949, lng: 135.785 },
    destNear: { lat: 35.0037, lng: 135.7786 },
    radiusM: 900,
    build: kiyomizuToGion,
  },
  {
    originNear: { lat: 35.0037, lng: 135.7786 },
    destNear: { lat: 34.9949, lng: 135.785 },
    radiusM: 900,
    build: (o, d, zh) => kiyomizuToGion(o, d, zh), // reverse still short bus; ok as demo
  },
  {
    originNear: { lat: 34.9671, lng: 135.7727 },
    destNear: { lat: 35.017, lng: 135.6717 },
    radiusM: 1200,
    build: fushimiToArashiyama,
  },
  {
    originNear: { lat: 35.017, lng: 135.6717 },
    destNear: { lat: 34.9671, lng: 135.7727 },
    radiusM: 1200,
    build: (o, d, zh) => {
      // Reverse: Arashiyama → Fushimi via Kyoto
      const result = fushimiToArashiyama(d, o, zh);
      return {
        ...result,
        transitSteps: [...result.transitSteps].reverse().map((s) => ({
          ...s,
          fromStopName: s.toStopName,
          toStopName: s.fromStopName,
        })),
      };
    },
  },
];

/** Generic multi-step transit when no Kyoto script matches. */
export function buildGenericDemoTransit(
  origin: LatLng,
  dest: LatLng,
  zh: boolean,
): RouteResult {
  const distanceM = Math.round(haversineM(origin, dest));
  const a = pointAlong(origin, dest, 0.12);
  const b = pointAlong(origin, dest, 0.45);
  const c = pointAlong(origin, dest, 0.55);
  const d = pointAlong(origin, dest, 0.88);
  const rideSec = Math.max(8 * 60, Math.round(distanceM / 8));
  const steps: TransitStep[] = [
    walkStep(
      zh ? "步行至最近车站" : "Walk to nearest station",
      origin,
      a,
      Math.max(4 * 60, Math.round(rideSec * 0.15)),
    ),
    transitStep({
      instruction: zh
        ? "示范线路 A · 上车前往换乘站"
        : "Demo Line A · ride to transfer",
      lineName: zh ? "示范线路 A" : "Demo Line A",
      agency: zh ? "演示交通" : "Demo Transit",
      vehicleType: distanceM > 4000 ? "TRAIN" : "BUS",
      fromStopName: zh ? "起点站" : "Origin stop",
      toStopName: zh ? "换乘站" : "Transfer hub",
      from: a,
      to: b,
      durationSec: Math.round(rideSec * 0.4),
    }),
    transferStep(
      zh ? "站内换乘" : "In-station transfer",
      c,
      4 * 60,
    ),
    transitStep({
      instruction: zh
        ? "示范线路 B · 前往目的地站"
        : "Demo Line B · ride to destination stop",
      lineName: zh ? "示范线路 B" : "Demo Line B",
      agency: zh ? "演示交通" : "Demo Transit",
      vehicleType: distanceM > 4000 ? "SUBWAY" : "BUS",
      fromStopName: zh ? "换乘站" : "Transfer hub",
      toStopName: zh ? "终点站" : "Destination stop",
      from: c,
      to: d,
      durationSec: Math.round(rideSec * 0.35),
    }),
    walkStep(
      zh ? "步行至停靠点" : "Walk to the stop",
      d,
      dest,
      Math.max(3 * 60, Math.round(rideSec * 0.1)),
    ),
  ];
  return assemble(steps, origin, dest);
}

export function buildDemoWalkOrDrive(
  origin: LatLng,
  dest: LatLng,
  mode: "walk" | "drive",
  zh: boolean,
): RouteResult {
  const distanceM = Math.round(haversineM(origin, dest));
  const speedMps = mode === "walk" ? 1.35 : 11;
  const durationSec = Math.max(60, Math.round(distanceM / speedMps));
  const mid = pointAlong(origin, dest, 0.5);
  const polyline = encodeSimplePolyline(
    interpolatePath(origin, dest, mode === "walk" ? 5 : 4),
  );
  return {
    durationSec,
    distanceM,
    polyline,
    transitSteps: [
      {
        instruction:
          mode === "walk"
            ? zh
              ? "沿示范路径步行"
              : "Walk along demo path"
            : zh
              ? "沿示范路径驾车"
              : "Drive demo route",
        mode: mode.toUpperCase(),
        durationSec,
        polyline: encodeSimplePolyline([origin, mid, dest]),
      },
    ],
  };
}

/** Prefer Kyoto scripted multi-leg transit; else generic multi-step demo. */
export function buildDemoTransitRoute(
  origin: LatLng,
  dest: LatLng,
  language?: string,
): RouteResult {
  const zh = !(language ?? "zh-CN").toLowerCase().startsWith("en");
  for (const script of SCRIPTS) {
    if (
      haversineM(origin, script.originNear) <= script.radiusM &&
      haversineM(dest, script.destNear) <= script.radiusM
    ) {
      return script.build(origin, dest, zh);
    }
  }
  return buildGenericDemoTransit(origin, dest, zh);
}
