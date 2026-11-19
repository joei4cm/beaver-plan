import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDemoTransitRoute,
  buildDemoWalkOrDrive,
} from "./demo-transit.js";
import {
  polylineLooksLikeChord,
  roadFollowPath,
} from "./demo-road-paths.js";
import { decodeSimplePolyline } from "./polyline.js";

describe("roadFollowPath", () => {
  it("returns a bent multi-vertex path, not a 2-point chord", () => {
    const origin = { lat: 35.0, lng: 135.75 };
    const dest = { lat: 35.02, lng: 135.78 };
    const path = roadFollowPath(origin, dest, { mode: "walk" });
    assert.ok(path.length >= 6);
    assert.equal(path[0]!.lat, origin.lat);
    assert.equal(path[path.length - 1]!.lat, dest.lat);
    assert.equal(
      polylineLooksLikeChord(
        path.map((p) => `${p.lat},${p.lng}`).join(";"),
      ),
      false,
    );
  });
});

describe("Kyoto demo transit geometry", () => {
  it("Kiyomizu → Gion hugs Higashiyama streets, not a chord", () => {
    const result = buildDemoTransitRoute(
      { lat: 34.9949, lng: 135.785 },
      { lat: 35.0037, lng: 135.7786 },
      "zh-CN",
    );
    assert.ok(result.polyline);
    assert.equal(polylineLooksLikeChord(result.polyline), false);
    assert.ok(result.transitSteps.length >= 3);
    for (const step of result.transitSteps) {
      if (!step.polyline) continue;
      const pts = decodeSimplePolyline(step.polyline);
      assert.ok(pts.length >= 3, `${step.mode} step should have road vertices`);
    }
  });

  it("Fushimi → Arashiyama follows JR corridors via Kyoto", () => {
    const result = buildDemoTransitRoute(
      { lat: 34.9671, lng: 135.7727 },
      { lat: 35.017, lng: 135.6717 },
      "zh-CN",
    );
    assert.ok(result.polyline);
    assert.equal(polylineLooksLikeChord(result.polyline), false);
    const ride = result.transitSteps.filter((s) => s.mode === "TRANSIT");
    assert.ok(ride.length >= 2);
    // Path should pass near Kyoto Station (transfer hub).
    const pts = decodeSimplePolyline(result.polyline!);
    const nearKyoto = pts.some(
      (p) => Math.abs(p.lat - 34.9858) < 0.01 && Math.abs(p.lng - 135.7588) < 0.015,
    );
    assert.ok(nearKyoto, "route should bend via Kyoto Station");
  });
});

describe("demo walk/drive", () => {
  it("does not emit straight stop-to-stop chords", () => {
    const walk = buildDemoWalkOrDrive(
      { lat: 35.0051, lng: 135.7649 },
      { lat: 35.0037, lng: 135.7786 },
      "walk",
      true,
    );
    assert.equal(polylineLooksLikeChord(walk.polyline), false);
    const drive = buildDemoWalkOrDrive(
      { lat: 35.0051, lng: 135.7649 },
      { lat: 34.9949, lng: 135.785 },
      "drive",
      true,
    );
    assert.equal(polylineLooksLikeChord(drive.polyline), false);
  });
});
