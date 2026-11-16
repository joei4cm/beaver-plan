import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCommentOnTrip,
  parseMentions,
} from "./collab.js";

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
