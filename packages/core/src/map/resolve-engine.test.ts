import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMapEngine } from "./resolve-engine.js";

test("auto prefers amap in mainland CN and google elsewhere", () => {
  assert.equal(resolveMapEngine("auto", "mainland_cn"), "amap");
  assert.equal(resolveMapEngine("auto", "other"), "google");
});

test("manual baidu wins; auto never selects baidu", () => {
  assert.equal(resolveMapEngine("baidu", "mainland_cn"), "baidu");
  assert.equal(resolveMapEngine("baidu", "other"), "baidu");
  assert.notEqual(resolveMapEngine("auto", "mainland_cn"), "baidu");
  assert.notEqual(resolveMapEngine("auto", "other"), "baidu");
});

test("manual google and amap overrides win", () => {
  assert.equal(resolveMapEngine("google", "mainland_cn"), "google");
  assert.equal(resolveMapEngine("amap", "other"), "amap");
});
