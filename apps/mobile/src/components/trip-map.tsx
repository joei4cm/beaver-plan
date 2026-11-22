import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  collectFitPoints,
  collectPathLines,
  strokeForMode,
  type LatLng,
  type Leg,
  type Stop,
} from "@beaver/core";
import { colors, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";

const locale = "zh-CN" as const;
const TILE = 256;
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

type Props = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId?: string | null;
  onSelectStop?: (id: string) => void;
  googleMapsKey?: string | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function lngToWorldX(lng: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  return ((lng + 180) / 360) * scale;
}

function latToWorldY(lat: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return y * scale;
}

function worldToLatLng(x: number, y: number, zoom: number): LatLng {
  const scale = TILE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function fitZoom(points: LatLng[], width: number, height: number): number {
  if (points.length === 0) return 12;
  const pad = 48;
  for (let z = 16; z >= 10; z--) {
    const xs = points.map((p) => lngToWorldX(p.lng, z));
    const ys = points.map((p) => latToWorldY(p.lat, z));
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w + pad * 2 <= width && h + pad * 2 <= height) return z;
  }
  return 11;
}

function tileUrl(z: number, x: number, y: number, esri: boolean) {
  const tpl = esri ? ESRI_URL : OSM_URL;
  return tpl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

type Seg = {
  key: string;
  left: number;
  top: number;
  width: number;
  angle: number;
  color: string;
  thickness: number;
};

function segmentsFromLine(
  id: string,
  points: LatLng[],
  project: (lat: number, lng: number) => { x: number; y: number },
  color: string,
  thickness: number,
): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = project(points[i]!.lat, points[i]!.lng);
    const b = project(points[i + 1]!.lat, points[i + 1]!.lng);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const width = Math.sqrt(dx * dx + dy * dy);
    if (width < 0.5) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    out.push({
      key: `${id}-${i}`,
      left: (a.x + b.x) / 2 - width / 2,
      top: (a.y + b.y) / 2 - thickness / 2,
      width,
      angle,
      color,
      thickness,
    });
  }
  return out;
}

/**
 * Interactive OSM/Esri slippy map for Expo (native + web).
 * Polylines are View segments (no react-native-svg) so Expo web stays stable.
 * Stop markers: Lumen depth + tip-011 press parity with web .bp-map-marker (#68/#147 / BEA-614).
 */
export function TripMap({
  stops,
  legs,
  selectedStopId = null,
  onSelectStop,
  googleMapsKey: _googleMapsKey,
}: Props) {
  const lines = useMemo(() => collectPathLines(stops, legs), [stops, legs]);
  const fitPts = useMemo(() => collectFitPoints(stops, lines), [stops, lines]);

  const [size, setSize] = useState({ w: 320, h: 240 });
  const [zoom, setZoom] = useState(12);
  const [center, setCenter] = useState<LatLng>({ lat: 35.0116, lng: 135.7681 });
  const [useEsri, setUseEsri] = useState(false);
  const [tileErrors, setTileErrors] = useState(0);
  const fittedKey = useRef("");

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  }, []);

  useEffect(() => {
    const key = `${stops.map((s) => s.id).join(",")}|${size.w}x${size.h}`;
    if (key === fittedKey.current || size.w < 40) return;
    fittedKey.current = key;
    const z = fitZoom(fitPts, size.w, size.h);
    const xs = fitPts.map((p) => lngToWorldX(p.lng, z));
    const ys = fitPts.map((p) => latToWorldY(p.lat, z));
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    setZoom(z);
    setCenter(worldToLatLng(midX, midY, z));
  }, [fitPts, size.h, size.w, stops]);

  useEffect(() => {
    if (tileErrors >= 3 && !useEsri) setUseEsri(true);
  }, [tileErrors, useEsri]);

  const centerWorld = useMemo(
    () => ({
      x: lngToWorldX(center.lng, zoom),
      y: latToWorldY(center.lat, zoom),
    }),
    [center.lat, center.lng, zoom],
  );

  const project = useCallback(
    (lat: number, lng: number) => ({
      x: lngToWorldX(lng, zoom) - centerWorld.x + size.w / 2,
      y: latToWorldY(lat, zoom) - centerWorld.y + size.h / 2,
    }),
    [centerWorld.x, centerWorld.y, size.h, size.w, zoom],
  );

  const tiles = useMemo(() => {
    const max = 2 ** zoom;
    const left = centerWorld.x - size.w / 2;
    const top = centerWorld.y - size.h / 2;
    const x0 = Math.floor(left / TILE) - 1;
    const y0 = Math.floor(top / TILE) - 1;
    const x1 = Math.floor((left + size.w) / TILE) + 1;
    const y1 = Math.floor((top + size.h) / TILE) + 1;
    const out: { key: string; left: number; top: number; url: string }[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const x = ((tx % max) + max) % max;
        if (ty < 0 || ty >= max) continue;
        out.push({
          key: `${zoom}/${x}/${ty}`,
          left: tx * TILE - left,
          top: ty * TILE - top,
          url: tileUrl(zoom, x, ty, useEsri),
        });
      }
    }
    return out;
  }, [centerWorld.x, centerWorld.y, size.h, size.w, useEsri, zoom]);

  const routeSegs = useMemo(() => {
    const casing: Seg[] = [];
    const core: Seg[] = [];
    for (const line of lines) {
      const stroke = strokeForMode(line.mode);
      casing.push(
        ...segmentsFromLine(
          `${line.id}-c`,
          line.points,
          project,
          "#FFFFFF",
          stroke.width + 3,
        ),
      );
      core.push(
        ...segmentsFromLine(
          line.id,
          line.points,
          project,
          stroke.color,
          stroke.width,
        ),
      );
    }
    return { casing, core };
  }, [lines, project]);

  const panRef = useRef({ c: center, z: zoom });
  panRef.current = { c: center, z: zoom };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          panRef.current = { c: center, z: zoom };
        },
        onPanResponderMove: (_, g) => {
          const { c, z } = panRef.current;
          const wx = lngToWorldX(c.lng, z) - g.dx;
          const wy = latToWorldY(c.lat, z) - g.dy;
          setCenter(worldToLatLng(wx, wy, z));
        },
      }),
    [center, zoom],
  );

  const zoomBy = (delta: number) => {
    const next = clamp(zoom + delta, 10, 17);
    if (next === zoom) return;
    setZoom(next);
  };

  return (
    <View style={styles.wrap} onLayout={onLayout} {...panResponder.panHandlers}>
      <View style={styles.tileLayer} pointerEvents="none">
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.url }}
            style={{
              position: "absolute",
              left: tile.left,
              top: tile.top,
              width: TILE,
              height: TILE,
            }}
            onError={() => setTileErrors((n) => n + 1)}
          />
        ))}
        <View style={styles.wash} />
      </View>

      <View style={styles.overlay} pointerEvents="none">
        {[...routeSegs.casing, ...routeSegs.core].map((seg) => (
          <View
            key={seg.key}
            style={{
              position: "absolute",
              left: seg.left,
              top: seg.top,
              width: seg.width,
              height: seg.thickness,
              backgroundColor: seg.color,
              borderRadius: seg.thickness / 2,
              transform: [{ rotate: `${seg.angle}deg` }],
            }}
          />
        ))}
      </View>

      {stops.map((stop, index) => {
        const p = project(stop.place.lat, stop.place.lng);
        const selected = stop.id === selectedStopId;
        // Web .bp-map-marker footprint twin — idle 22 / active 30 (#68/#147).
        const dim = selected ? 30 : 22;
        return (
          <Pressable
            key={stop.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Stop ${index + 1}`}
            onPress={() => onSelectStop?.(stop.id)}
            style={({ pressed }) => [
              styles.stopMarker,
              {
                left: p.x - dim / 2,
                top: p.y - dim / 2,
                width: dim,
                height: dim,
                borderRadius: dim / 2,
              },
              selected ? styles.stopMarkerOn : null,
              // tip-011 press — keep selected lift when scale presses.
              pressed
                ? selected
                  ? styles.stopMarkerOnPressed
                  : styles.stopMarkerPressed
                : null,
            ]}
          >
            {selected ? (
              <View style={styles.stopMarkerHalo} pointerEvents="none" />
            ) : null}
            <Text
              style={[
                styles.stopMarkerLabel,
                selected ? styles.stopMarkerLabelOn : null,
              ]}
            >
              {index + 1}
            </Text>
          </Pressable>
        );
      })}

      <Text style={styles.badge}>{t(locale, "mobile.itinerary")}</Text>
      <Text style={styles.attrib}>
        {useEsri ? "Esri" : "OSM"}
        {Platform.OS === "web" ? " · Expo web" : ""}
      </Text>

      <View style={styles.zoomCol}>
        <Pressable style={styles.zoomBtn} onPress={() => zoomBy(1)}>
          <Text style={styles.zoomLabel}>+</Text>
        </Pressable>
        <Pressable style={styles.zoomBtn} onPress={() => zoomBy(-1)}>
          <Text style={styles.zoomLabel}>−</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 280,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "#EAF0F8",
  },
  tileLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  wash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(244,246,250,0.18)",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  /*
   * Map stop markers — Expo catch-up beyond web #68/#147 (BEA-614).
   * Type: tabular-nums · 700 · active 12px. Motion: tip-011 press.
   * Depth: Lumen cast shadow · riverDeep ring · soft halo · lift.
   */
  stopMarker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.foam,
    borderWidth: 2.5,
    borderColor: colors.river,
    zIndex: 3,
    shadowColor: colors.shadowDeep,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stopMarkerOn: {
    backgroundColor: colors.river,
    borderColor: colors.riverDeep,
    zIndex: 6,
    // Lifted pin twin of web translateY(-1px) + deeper cast.
    transform: [{ translateY: -1 }],
    shadowColor: colors.shadowDeep,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /* tip-011 press — stopChip / Mode mist-track opacity+scale twin. */
  stopMarkerPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  stopMarkerOnPressed: {
    opacity: 0.92,
    transform: [{ translateY: -1 }, { scale: 0.98 }],
  },
  stopMarkerHalo: {
    position: "absolute",
    left: -6,
    top: -6,
    right: -6,
    bottom: -6,
    borderRadius: 999,
    backgroundColor: `${colors.river}38`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.river}2E`,
  },
  stopMarkerLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: colors.ink,
    zIndex: 1,
  },
  stopMarkerLabelOn: {
    fontSize: 12,
    color: colors.foam,
  },
  badge: {
    position: "absolute",
    left: 12,
    top: 12,
    color: colors.river,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.22)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
    overflow: "hidden",
    zIndex: 4,
  },
  attrib: {
    position: "absolute",
    right: 10,
    bottom: 8,
    fontSize: 9,
    color: colors.inkSoft,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
    zIndex: 4,
  },
  zoomCol: {
    position: "absolute",
    right: 10,
    top: 10,
    zIndex: 4,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.foam,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  zoomLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    lineHeight: 20,
  },
});
