#!/usr/bin/env node
/**
 * Schema-only smoke (no Neon required).
 * Validates migration SQL + Drizzle schema export shape for comments/activity.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = resolve(root, "drizzle/0001_collab_comments_activity.sql");
const sql = readFileSync(sqlPath, "utf8");

assert.match(sql, /CREATE TABLE "trip_comments"/);
assert.match(sql, /CREATE TABLE "trip_activity_events"/);
assert.match(sql, /"mentions" jsonb/);
assert.match(sql, /FOREIGN KEY \("trip_id"\) REFERENCES "public"\."trips"/);

const schemaUrl = pathToFileURL(resolve(root, "src/db/schema.ts")).href;
// Load via tsx when invoked as: pnpm exec tsx scripts/smoke-collab-schema.mjs
const { schema, tripComments, tripActivityEvents } = await import(schemaUrl);

assert.ok(schema.tripComments, "schema.tripComments exported");
assert.ok(schema.tripActivityEvents, "schema.tripActivityEvents exported");
assert.equal(tripComments[Symbol.for("drizzle:Name")], "trip_comments");
assert.equal(tripActivityEvents[Symbol.for("drizzle:Name")], "trip_activity_events");

console.log("ok collab schema smoke (migration + drizzle exports)");
