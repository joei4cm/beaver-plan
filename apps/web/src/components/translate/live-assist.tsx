"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STREAMING_CHUNK_MS,
  PRIMARY_TRANSLATION_LOCALES,
  TRANSLATION_LOCALES,
  enqueueTranslation,
  listPhrasebook,
  listQueuedTranslations,
  localeLabel,
  markQueuedFlushed,
  offlinePhraseTranslate,
  pendingQueueCount,
  removeQueuedTranslation,
  swapPair,
  type PhraseCategory,
  type PhrasebookLookup,
  type QueuedTranslation,
  type TranslationLocale,
} from "@beaver/core";
import { t, type Locale, type MessageKey } from "@beaver/i18n";
import { apiBase, apiGet, apiSend } from "@/lib/api";
import {
  createWebOfflineQueueStore,
  isBrowserOnline,
} from "@/lib/translate/offline-queue-store";

type Status = {
  mode: "live" | "demo";
  asr: string;
  llm: string;
  tts: string;
  vision: string;
  featureEnabled: boolean;
  locales: string[];
  primaryLocales?: string[];
  streamingMode?: string;
  offlineAssist?: string;
  streaming?: { chunkMs?: number; mode?: string };
};

type Turn = {
  id: string;
  sourceText: string;
  translatedText: string;
  mode: "live" | "demo" | "offline";
};

type TurnResponse = {
  sourceText: string;
  translatedText: string;
  mode: "live" | "demo";
  tts: {
    audioBase64: string | null;
    mimeType: string;
    speakLocally: boolean;
  } | null;
};

type SpeakableTurn = {
  sourceText: string;
  translatedText: string;
  mode: "live" | "demo" | "offline";
  tts?: TurnResponse["tts"];
};

type PartialResponse = {
  text: string;
  isFinal: boolean;
  provider: string;
  mode: "live" | "demo";
};

type PhrasebookResponse = {
  phrases: PhrasebookLookup[];
};

const CATEGORY_KEYS: PhraseCategory[] = [
  "greetings",
  "directions",
  "food",
  "shopping",
  "emergency",
  "lodging",
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const b64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function speakLocal(text: string, locale: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = locale.startsWith("zh") ? "zh-CN" : locale;
  utter.rate = 0.96;
  window.speechSynthesis.speak(utter);
}

async function playAudioBase64(b64: string, mimeType: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: {
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function LiveAssist({ locale }: { locale: Locale }) {
  const queueStore = useMemo(() => createWebOfflineQueueStore(), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [sourceLocale, setSourceLocale] = useState<TranslationLocale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<TranslationLocale>("en");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoIndex, setDemoIndex] = useState(0);
  const [online, setOnline] = useState(true);
  const [phrases, setPhrases] = useState<PhrasebookLookup[]>([]);
  const [phraseCategory, setPhraseCategory] =
    useState<PhraseCategory>("greetings");
  const [queue, setQueue] = useState<QueuedTranslation[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sequenceRef = useRef(0);
  const sessionIdRef = useRef(`sess_${Date.now().toString(36)}`);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunkMs =
    status?.streaming?.chunkMs ?? DEFAULT_STREAMING_CHUNK_MS;

  const refreshQueue = useCallback(async () => {
    setQueue(await listQueuedTranslations(queueStore));
  }, [queueStore]);

  useEffect(() => {
    setOnline(isBrowserOnline());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void refreshQueue();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refreshQueue]);

  useEffect(() => {
    void apiGet<Status>("/v1/translation/status")
      .then(setStatus)
      .catch(() =>
        setStatus({
          mode: "demo",
          asr: "demo-asr",
          llm: "demo-llm",
          tts: "demo-tts",
          vision: "demo-vision",
          featureEnabled: true,
          locales: [...TRANSLATION_LOCALES],
          primaryLocales: [...PRIMARY_TRANSLATION_LOCALES],
          streamingMode: "chunked",
          offlineAssist: "phrasebook",
        }),
      );
  }, []);

  useEffect(() => {
    void apiGet<PhrasebookResponse>(
      `/v1/translation/phrasebook?sourceLocale=${encodeURIComponent(sourceLocale)}&targetLocale=${encodeURIComponent(targetLocale)}&category=${phraseCategory}`,
    )
      .then((res) => setPhrases(res.phrases))
      .catch(() => {
        // Client-side fallback from core bundle if API unreachable
        setPhrases(listPhrasebook(sourceLocale, targetLocale, phraseCategory));
      });
  }, [sourceLocale, targetLocale, phraseCategory]);

  const pushAndSpeak = useCallback(
    async (res: SpeakableTurn) => {
      if (!res.sourceText && !res.translatedText) return;
      setTurns((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceText: res.sourceText,
          translatedText: res.translatedText,
          mode: res.mode,
        },
        ...prev,
      ]);
      if (res.tts !== undefined) setDemoIndex((i) => i + 1);
      if (!res.translatedText) return;
      if (res.tts?.audioBase64 && !res.tts.speakLocally) {
        try {
          await playAudioBase64(res.tts.audioBase64, res.tts.mimeType);
          return;
        } catch {
          /* fall through */
        }
      }
      await speakLocal(res.translatedText, targetLocale);
    },
    [targetLocale],
  );

  async function runTurn(input: {
    text?: string;
    audioBase64?: string;
    mimeType?: string;
  }) {
    setBusy(true);
    setError(null);
    setPartialText("");
    try {
      if (!isBrowserOnline()) {
        const text =
          input.text?.trim() ||
          offlinePhraseTranslate(
            "",
            sourceLocale,
            targetLocale,
          )?.sourceText ||
          "";
        if (input.text?.trim()) {
          const item = await enqueueTranslation(queueStore, {
            text: input.text.trim(),
            sourceLocale,
            targetLocale,
          });
          await pushAndSpeak({
            sourceText: item.text,
            translatedText:
              item.offlineHint?.translatedText ??
              `[${targetLocale}] ${item.text}`,
            mode: "offline",
          });
          await refreshQueue();
          return;
        }
        // Demo / empty mic offline → phrasebook first greeting for pair
        const hit = offlinePhraseTranslate(
          "你好",
          sourceLocale,
          targetLocale,
        );
        if (hit) {
          await pushAndSpeak({
            sourceText: hit.sourceText,
            translatedText: hit.translatedText,
            mode: "offline",
          });
        }
        return;
      }

      const res = await apiSend<TurnResponse>("/v1/translation/turn", "POST", {
        ...input,
        sourceLocale,
        targetLocale,
        withTts: true,
        demoTurnIndex: demoIndex,
      });
      await pushAndSpeak(res);
    } catch {
      // Semi-offline fallback: phrasebook or queue
      const text = input.text?.trim();
      if (text) {
        const hit = offlinePhraseTranslate(text, sourceLocale, targetLocale);
        if (hit) {
          await pushAndSpeak({
            sourceText: hit.sourceText,
            translatedText: hit.translatedText,
            mode: "offline",
          });
        } else {
          const item = await enqueueTranslation(queueStore, {
            text,
            sourceLocale,
            targetLocale,
          });
          await pushAndSpeak({
            sourceText: item.text,
            translatedText:
              item.offlineHint?.translatedText ??
              `[${targetLocale}] ${item.text}`,
            mode: "offline",
          });
          await refreshQueue();
        }
      } else {
        setError(t(locale, "translate.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function postPartialChunk(blob: Blob, sequence: number) {
    if (blob.size < 32 || !isBrowserOnline()) return;
    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await apiSend<PartialResponse>(
        "/v1/translation/partial",
        "POST",
        {
          audioBase64,
          mimeType: blob.type || "audio/webm",
          locale: sourceLocale,
          targetLocale,
          sessionId: sessionIdRef.current,
          sequence,
          demoTurnIndex: demoIndex,
        },
      );
      if (res.text) setPartialText(res.text);
    } catch {
      /* optimistic UI best-effort */
    }
  }

  function startDeviceInterim() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = sourceLocale.startsWith("zh") ? "zh-CN" : sourceLocale;
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (ev) => {
        let interim = "";
        let finalText = "";
        for (let i = 0; i < ev.results.length; i++) {
          const row = ev.results[i]!;
          if (row.isFinal) finalText += row[0].transcript;
          else interim += row[0].transcript;
        }
        setPartialText((finalText || interim).trim());
      };
      rec.onerror = () => {
        /* ignore — MediaRecorder path still works */
      };
      recognitionRef.current = rec;
      rec.start();
    } catch {
      recognitionRef.current = null;
    }
  }

  function stopDeviceInterim() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }

  async function startMic() {
    setError(null);
    setPartialText("");
    sequenceRef.current = 0;
    sessionIdRef.current = `sess_${Date.now().toString(36)}`;
    startDeviceInterim();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          const seq = sequenceRef.current++;
          // Optimistic chunked partial (in addition to device interim)
          void postPartialChunk(e.data, seq);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        stopDeviceInterim();
        void (async () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          if (blob.size < 64) {
            await runTurn({});
            return;
          }
          const audioBase64 = await blobToBase64(blob);
          await runTurn({
            audioBase64,
            mimeType: blob.type || "audio/webm",
          });
        })();
      };
      mediaRecorderRef.current = recorder;
      recorder.start(chunkMs);
      setListening(true);
    } catch {
      stopDeviceInterim();
      setError(t(locale, "translate.permissionMic"));
      await runTurn({});
    }
  }

  function stopMic() {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    setListening(false);
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopDeviceInterim();
    }
  }

  async function onSend() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await runTurn({ text });
  }

  async function onQueueDraft() {
    const text = draft.trim();
    if (!text) return;
    const item = await enqueueTranslation(queueStore, {
      text,
      sourceLocale,
      targetLocale,
    });
    setDraft("");
    await pushAndSpeak({
      sourceText: item.text,
      translatedText:
        item.offlineHint?.translatedText ?? `[${targetLocale}] ${item.text}`,
      mode: "offline",
    });
    await refreshQueue();
  }

  async function onFlushQueue() {
    if (!isBrowserOnline()) return;
    const pending = queue.filter((q) => q.status === "queued");
    for (const item of pending) {
      try {
        const res = await apiSend<TurnResponse>("/v1/translation/turn", "POST", {
          text: item.text,
          sourceLocale: item.pair.sourceLocale,
          targetLocale: item.pair.targetLocale,
          withTts: true,
          demoTurnIndex: demoIndex,
        });
        await markQueuedFlushed(queueStore, item.id);
        await pushAndSpeak(res);
      } catch {
        /* keep queued */
      }
    }
    await refreshQueue();
  }

  async function onPhrase(phrase: PhrasebookLookup) {
    await pushAndSpeak({
      sourceText: phrase.sourceText,
      translatedText: phrase.translatedText,
      mode: online ? "demo" : "offline",
    });
  }

  const locales = (status?.locales as TranslationLocale[] | undefined) ?? [
    ...TRANSLATION_LOCALES,
  ];
  const primary = new Set(
    (status?.primaryLocales as string[] | undefined) ??
      PRIMARY_TRANSLATION_LOCALES,
  );
  const orderedLocales = [
    ...locales.filter((l) => primary.has(l)),
    ...locales.filter((l) => !primary.has(l)),
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-8 md:px-10">
      <div className="animate-rise">
        <p className="text-xs uppercase tracking-[0.22em] text-river/75">
          Beaver Plan · 海狸旅行
        </p>
        <p className="mt-3 text-sm uppercase tracking-[0.2em] text-river-deep/80">
          {t(locale, "translate.eyebrow")}
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-ink md:text-5xl">
          {t(locale, "translate.title")}
        </h1>
        <p className="mt-4 max-w-xl text-ink-soft">
          {t(locale, "translate.webSupport")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span
            className={`rounded-md px-2.5 py-1 font-medium text-foam ${
              status?.mode === "live" ? "bg-focus/80" : "bg-timber/80"
            }`}
          >
            {status?.mode === "live"
              ? t(locale, "translate.liveBadge")
              : t(locale, "translate.demoBadge")}
          </span>
          <span className="rounded-md bg-mist px-2.5 py-1 font-medium text-river-deep">
            {t(locale, "translate.streamingBadge")}
          </span>
          <span className="rounded-md bg-mist px-2.5 py-1 font-medium text-river-deep">
            {online
              ? t(locale, "offline.online")
              : t(locale, "translate.offlineBadge")}
          </span>
          <span className="text-ink-soft/70">
            ASR {status?.asr ?? "…"} · LLM {status?.llm ?? "…"} · TTS{" "}
            {status?.tts ?? "…"}
          </span>
          <span className="font-mono text-[11px] text-ink-soft/50">
            {apiBase()}
          </span>
        </div>
      </div>

      <div
        className="animate-rise mt-10 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end"
        style={{ animationDelay: "60ms" }}
      >
        <LocaleSelect
          label={t(locale, "translate.source")}
          value={sourceLocale}
          locales={orderedLocales}
          primary={primary}
          ui={locale}
          onChange={setSourceLocale}
        />
        <button
          type="button"
          onClick={() => {
            const next = swapPair({ sourceLocale, targetLocale });
            setSourceLocale(next.sourceLocale);
            setTargetLocale(next.targetLocale);
          }}
          className="mb-1 h-10 w-10 justify-self-center rounded-full bg-mist text-river-deep transition hover:bg-river hover:text-foam"
          aria-label={t(locale, "translate.swap")}
        >
          ⇄
        </button>
        <LocaleSelect
          label={t(locale, "translate.target")}
          value={targetLocale}
          locales={orderedLocales}
          primary={primary}
          ui={locale}
          onChange={setTargetLocale}
        />
      </div>

      {error ? (
        <p className="mt-4 text-sm text-timber">{error}</p>
      ) : null}

      {(listening || partialText) && (
        <p className="mt-6 rounded-md bg-mist/80 px-4 py-3 text-sm text-river-deep">
          <span className="mr-2 text-xs uppercase tracking-[0.14em] text-river">
            {t(locale, "translate.partialHint")}
          </span>
          {partialText || "…"}
        </p>
      )}

      <div
        className="animate-rise mt-8 space-y-3"
        style={{ animationDelay: "120ms" }}
      >
        {turns.length === 0 ? (
          <p className="border-y border-[color:var(--bp-line)] py-10 text-ink-soft">
            {t(locale, "translate.empty")}
          </p>
        ) : (
          turns.map((row) => (
            <article
              key={row.id}
              className="border-b border-[color:var(--bp-line)] py-5"
            >
              <p className="text-sm text-ink-soft">{row.sourceText}</p>
              <p className="mt-2 font-display text-2xl leading-snug text-ink">
                {row.translatedText}
              </p>
              {row.mode === "offline" ? (
                <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-timber">
                  {t(locale, "translate.offlineBadge")}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>

      <section className="animate-rise mt-12" style={{ animationDelay: "140ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-ink">
              {t(locale, "translate.phrasebook")}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {t(locale, "translate.phrasebookHint")}
            </p>
          </div>
          <span className="text-xs text-ink-soft/70">
            {pendingQueueCount(queue) > 0
              ? t(locale, "offline.pending").replace(
                  "{n}",
                  String(pendingQueueCount(queue)),
                )
              : null}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORY_KEYS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setPhraseCategory(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                phraseCategory === cat
                  ? "bg-river text-foam"
                  : "bg-mist text-river-deep hover:bg-river/15"
              }`}
            >
              {t(locale, `translate.category.${cat}` as MessageKey)}
            </button>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-[color:var(--bp-line)] border-y border-[color:var(--bp-line)]">
          {phrases.map((phrase) => (
            <li key={phrase.id}>
              <button
                type="button"
                onClick={() => void onPhrase(phrase)}
                className="flex w-full flex-col items-start gap-1 py-3 text-left transition hover:bg-mist/40"
              >
                <span className="text-sm text-ink-soft">{phrase.sourceText}</span>
                <span className="font-medium text-ink">
                  {phrase.translatedText}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-river">
            {t(locale, "translate.queue")}
          </h3>
          {queue.filter((q) => q.status === "queued").length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              {t(locale, "translate.queueEmpty")}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {queue
                .filter((q) => q.status === "queued")
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="text-ink">{item.text}</p>
                      {item.offlineHint ? (
                        <p className="text-ink-soft">
                          {item.offlineHint.translatedText}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-timber"
                      onClick={() =>
                        void removeQueuedTranslation(queueStore, item.id).then(
                          refreshQueue,
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void onFlushQueue()}
            disabled={!online || pendingQueueCount(queue) === 0}
            className="mt-3 rounded-md border border-[color:var(--bp-line)] bg-paper px-3 py-2 text-xs font-medium text-river disabled:opacity-40"
          >
            {t(locale, "translate.queueFlush")}
          </button>
        </div>
      </section>

      <div
        className="animate-rise sticky bottom-0 mt-10 -mx-6 border-t border-[color:var(--bp-line)] bg-foam/80 px-6 py-4 backdrop-blur-md md:-mx-10 md:px-10"
        style={{ animationDelay: "160ms" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSend();
            }}
            placeholder={t(locale, "translate.typeHint")}
            className="flex-1 rounded-md border border-[color:var(--bp-line)] bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-focus focus:ring-2"
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={busy}
            className="rounded-md bg-river px-4 py-2.5 text-sm font-medium text-foam transition hover:bg-river-deep disabled:opacity-50"
          >
            {busy
              ? t(locale, "translate.translating")
              : t(locale, "translate.send")}
          </button>
          <button
            type="button"
            onClick={() => void onQueueDraft()}
            disabled={busy || !draft.trim()}
            className="rounded-md border border-[color:var(--bp-line)] bg-paper px-4 py-2.5 text-sm font-medium text-river disabled:opacity-50"
          >
            {t(locale, "translate.queueAdd")}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onMouseDown={() => void startMic()}
            onMouseUp={stopMic}
            onMouseLeave={() => {
              if (listening) stopMic();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              void startMic();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopMic();
            }}
            disabled={busy && !listening}
            className={`min-w-[10rem] flex-1 rounded-md px-4 py-3 text-sm font-semibold text-foam transition disabled:opacity-50 ${
              listening ? "bg-timber" : "bg-river-deep hover:bg-river"
            }`}
          >
            {listening
              ? t(locale, "translate.listening")
              : t(locale, "translate.holdMic")}
          </button>
          <button
            type="button"
            onClick={() => void runTurn({})}
            disabled={busy}
            className="rounded-md border border-[color:var(--bp-line)] bg-paper px-4 py-3 text-sm font-medium text-river transition hover:border-river/40 disabled:opacity-50"
          >
            {t(locale, "translate.nextDemo")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LocaleSelect({
  label,
  value,
  locales,
  primary,
  ui,
  onChange,
}: {
  label: string;
  value: TranslationLocale;
  locales: TranslationLocale[];
  primary: Set<string>;
  ui: Locale;
  onChange: (v: TranslationLocale) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.16em] text-river">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TranslationLocale)}
        className="mt-2 w-full rounded-md border border-[color:var(--bp-line)] bg-foam px-3 py-2.5 text-sm text-ink outline-none ring-focus focus:ring-2"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeLabel(loc, ui === "en" ? "en" : "zh-CN")}
            {primary.has(loc) ? "" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
