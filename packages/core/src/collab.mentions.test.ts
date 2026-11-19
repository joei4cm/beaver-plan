import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCommentOnTrip,
  parseMentions,
} from "./collab.js";
import { sampleKyotoCollab } from "./map/sample-kyoto.js";

describe("parseMentions", () => {
  it("matches member display names after @", () => {
    assert.deepEqual(
      parseMentions("Hey @Companion see this", ["Companion", "Demo Traveler"]),
      ["Companion"],
    );
  });

  it("prefers longer names when overlapping", () => {
    assert.deepEqual(
      parseMentions("@Demo Traveler check in", ["Demo", "Demo Traveler"]),
      ["Demo Traveler"],
    );
  });

  it("returns empty when no @ or no names", () => {
    assert.deepEqual(parseMentions("no mentions", ["Companion"]), []);
    assert.deepEqual(parseMentions("@Nobody", []), []);
  });
});

describe("canCommentOnTrip", () => {
  it("allows editor/owner and blocks viewer", () => {
    assert.equal(canCommentOnTrip("owner"), true);
    assert.equal(canCommentOnTrip("editor"), true);
    assert.equal(canCommentOnTrip("viewer"), false);
    assert.equal(canCommentOnTrip(undefined), false);
  });
});

describe("sampleKyotoCollab", () => {
  it("seeds members, @mentions, and a timeline rail", () => {
    const seed = sampleKyotoCollab();
    assert.equal(seed.yourRole, "owner");
    assert.ok(seed.members.length >= 2);
    assert.ok(seed.comments.some((c) => c.mentions.includes("Demo Traveler")));
    assert.ok(seed.events.some((e) => e.type === "comment_added"));
    assert.ok(seed.events.some((e) => e.type === "member_joined"));
  });
});
