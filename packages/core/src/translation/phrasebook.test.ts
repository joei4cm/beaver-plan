import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findPhraseById,
  listPhrasebook,
  offlinePhraseTranslate,
  TRAVEL_PHRASEBOOK,
} from "./phrasebook.js";
import {
  enqueueTranslation,
  pendingQueueCount,
  type OfflineQueueStore,
  type QueuedTranslation,
} from "./offline-queue.js";
import { PRIMARY_TRANSLATION_LOCALES } from "./types.js";
import { getStreamingProviderSettings, deepgramLiveUrl } from "./streaming.js";
import { demoTurnsFor } from "./demo-script.js";

describe("phrasebook", () => {
  it("covers primary travel locales for hello", () => {
    const hello = TRAVEL_PHRASEBOOK.find((p) => p.key === "hello");
    assert.ok(hello);
    for (const loc of PRIMARY_TRANSLATION_LOCALES) {
      assert.ok(hello!.text[loc], `missing hello for ${loc}`);
    }
  });

  it("lists lookups for zh-CN → ja", () => {
    const rows = listPhrasebook("zh-CN", "ja");
    assert.ok(rows.length >= 10);
    const bathroom = rows.find((r) => r.key === "where_bathroom");
    assert.equal(bathroom?.translatedText, "トイレはどこですか？");
  });

  it("offlinePhraseTranslate hits phrasebook", () => {
    const hit = offlinePhraseTranslate("这个多少钱？", "zh-CN", "ko");
    assert.ok(hit);
    assert.equal(hit!.translatedText, "이거 얼마예요?");
  });

  it("findPhraseById works", () => {
    const row = findPhraseById("food-water", "en", "fr");
    assert.ok(row);
    assert.match(row!.translatedText, /eau/i);
  });
});

describe("offline queue", () => {
  it("enqueues with phrasebook hint", async () => {
    let mem: QueuedTranslation[] = [];
    const store: OfflineQueueStore = {
      load: async () => [...mem],
      save: async (items) => {
        mem = items;
      },
    };
    const item = await enqueueTranslation(store, {
      text: "谢谢",
      sourceLocale: "zh-CN",
      targetLocale: "de",
    });
    assert.equal(item.offlineHint?.translatedText, "Danke");
    assert.equal(pendingQueueCount(mem), 1);
  });
});

describe("streaming settings", () => {
  it("exposes deepgram + openai realtime docs without secrets", () => {
    const s = getStreamingProviderSettings({ mode: "chunked" });
    assert.equal(s.mode, "chunked");
    assert.ok(s.deepgram.liveUrl.startsWith("wss://"));
    assert.ok(s.openaiRealtime.url.includes("realtime"));
    assert.ok(s.deepgram.listenQuery.includes("interim_results=true"));
    const live = deepgramLiveUrl("zh-CN");
    assert.match(live, /language=zh/);
  });
});

describe("demo scripts", () => {
  it("has scripted turns for primary pairs", () => {
    const pairs = [
      ["zh-CN", "ja"],
      ["zh-CN", "ko"],
      ["zh-CN", "fr"],
      ["zh-CN", "es"],
      ["zh-CN", "de"],
      ["en", "ja"],
      ["en", "ko"],
      ["en", "fr"],
      ["en", "es"],
      ["en", "de"],
    ] as const;
    for (const [sourceLocale, targetLocale] of pairs) {
      const turns = demoTurnsFor({ sourceLocale, targetLocale });
      assert.ok(turns.length >= 1, `${sourceLocale}|${targetLocale}`);
      assert.ok(!turns[0]!.sourceText.startsWith("["));
    }
  });
});
