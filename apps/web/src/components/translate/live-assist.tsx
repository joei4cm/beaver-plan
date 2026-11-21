"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STREAMING_CHUNK_MS,
  PRIMARY_TRANSLATION_LOCALES,
  TRANSLATION_LOCALES,
  demoTurnsFor,
  demoVisionAssist,
  enqueueTranslation,
  listPhrasebook,
  listQueuedTranslations,
  localeLabel,
  markQueuedFlushed,
  offlinePhraseTranslate,
  pendingQueueCount,
  pickDemoTurn,
  removeQueuedTranslation,
  swapPair,
  type PhraseCategory,
  type PhrasebookLookup,
  type QueuedTranslation,
  type TranslationLocale,
} from "@beaver/core";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale, type MessageKey } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiBase, apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
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

type Tab = "conversation" | "camera";
type Facing = "user" | "environment";

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

function softDemoStatus(): Status {
  return {
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
  };
}

function seedTurns(
  sourceLocale: TranslationLocale,
  targetLocale: TranslationLocale,
): Turn[] {
  return demoTurnsFor({ sourceLocale, targetLocale })
    .slice(0, 2)
    .map((row, i) => ({
      id: `seed-${i}-${row.sourceText.slice(0, 8)}`,
      sourceText: row.sourceText,
      translatedText: row.translatedText,
      mode: "demo" as const,
    }));
}

export function LiveAssist({ locale }: { locale: Locale }) {
  const queueStore = useMemo(() => createWebOfflineQueueStore(), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [softNotice, setSoftNotice] = useState(false);
  const [tab, setTab] = useState<Tab>("conversation");
  const [sourceLocale, setSourceLocale] = useState<TranslationLocale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<TranslationLocale>("en");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => seedTurns("zh-CN", "en"));
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoIndex, setDemoIndex] = useState(2);
  const [online, setOnline] = useState(true);
  const [phrases, setPhrases] = useState<PhrasebookLookup[]>([]);
  const [phraseCategory, setPhraseCategory] =
    useState<PhraseCategory>("greetings");
  const [queue, setQueue] = useState<QueuedTranslation[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [facing, setFacing] = useState<Facing>("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [overlay, setOverlay] = useState<{
    source: string;
    translated: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sequenceRef = useRef(0);
  const sessionIdRef = useRef(`sess_${Date.now().toString(36)}`);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const seededPairRef = useRef("zh-CN|en");
  const chunkMs =
    status?.streaming?.chunkMs ?? DEFAULT_STREAMING_CHUNK_MS;

  const brandPrimary = locale === "zh-CN" ? brand.zh : brand.en;
  const brandSecondary = locale === "zh-CN" ? brand.en : brand.zh;
  const isDemo = !status || status.mode === "demo" || softNotice;

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
      .then((res) => {
        setStatus(res);
        setSoftNotice(res.mode === "demo");
      })
      .catch((err) => {
        setStatus(softDemoStatus());
        setSoftNotice(true);
        if (!isPlannerNoiseError(err)) {
          /* still soft — never surface Failed to fetch */
        }
      });
  }, []);

  useEffect(() => {
    void apiGet<PhrasebookResponse>(
      `/v1/translation/phrasebook?sourceLocale=${encodeURIComponent(sourceLocale)}&targetLocale=${encodeURIComponent(targetLocale)}&category=${phraseCategory}`,
    )
      .then((res) => setPhrases(res.phrases))
      .catch(() => {
        setPhrases(listPhrasebook(sourceLocale, targetLocale, phraseCategory));
      });
  }, [sourceLocale, targetLocale, phraseCategory]);

  useEffect(() => {
    const key = `${sourceLocale}|${targetLocale}`;
    if (seededPairRef.current === key) return;
    seededPairRef.current = key;
    setTurns(seedTurns(sourceLocale, targetLocale));
    setDemoIndex(2);
    setOverlay(null);
  }, [sourceLocale, targetLocale]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  useEffect(() => {
    if (tab !== "camera" || !cameraReady || !cameraStreamRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = cameraStreamRef.current;
    void el.play().catch(() => {
      /* autoplay may be blocked until gesture */
    });
  }, [tab, cameraReady]);

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
      if (!res.translatedText || !ttsEnabled) return;
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
    [targetLocale, ttsEnabled],
  );

  const localDemoTurn = useCallback(
    async (input: { text?: string }) => {
      const text = input.text?.trim();
      if (text) {
        const hit = offlinePhraseTranslate(text, sourceLocale, targetLocale);
        await pushAndSpeak({
          sourceText: text,
          translatedText:
            hit?.translatedText ?? `[${targetLocale}] ${text}`,
          mode: "demo",
          tts: {
            audioBase64: null,
            mimeType: "audio/mpeg",
            speakLocally: true,
          },
        });
        return;
      }
      const turn = pickDemoTurn({ sourceLocale, targetLocale }, demoIndex);
      await pushAndSpeak({
        sourceText: turn.sourceText,
        translatedText: turn.translatedText,
        mode: "demo",
        tts: { audioBase64: null, mimeType: "audio/mpeg", speakLocally: true },
      });
    },
    [demoIndex, pushAndSpeak, sourceLocale, targetLocale],
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
        const text = input.text?.trim();
        if (text) {
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
          return;
        }
        const hit = offlinePhraseTranslate("你好", sourceLocale, targetLocale);
        if (hit) {
          await pushAndSpeak({
            sourceText: hit.sourceText,
            translatedText: hit.translatedText,
            mode: "offline",
          });
        } else {
          await localDemoTurn({});
        }
        return;
      }

      const res = await apiSend<TurnResponse>("/v1/translation/turn", "POST", {
        ...input,
        sourceLocale,
        targetLocale,
        withTts: ttsEnabled,
        demoTurnIndex: demoIndex,
      });
      await pushAndSpeak(res);
    } catch (err) {
      setSoftNotice(true);
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
      } else if (
        !input.audioBase64 ||
        isPlannerNoiseError(err) ||
        softNotice ||
        status?.mode === "demo"
      ) {
        await localDemoTurn({});
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
      const turn = pickDemoTurn({ sourceLocale, targetLocale }, demoIndex);
      setPartialText(turn.sourceText.slice(0, 18) + "…");
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
          withTts: ttsEnabled,
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

  async function startCamera(nextFacing: Facing = facing) {
    try {
      cameraStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setCameraReady(false);
    }
  }

  async function onVision(mode: "ocr" | "caption") {
    setBusy(true);
    setError(null);
    try {
      let imageBase64: string | undefined;
      if (videoRef.current && cameraReady) {
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL("image/jpeg", 0.55);
          imageBase64 = data.includes(",") ? data.split(",")[1] : data;
        }
      }
      try {
        const res = await apiSend<{
          sourceText: string;
          translatedText: string | null;
          mode: "live" | "demo";
        }>("/v1/translation/vision", "POST", {
          imageBase64,
          mimeType: "image/jpeg",
          mode,
          sourceLocale,
          targetLocale,
        });
        setOverlay({
          source: res.sourceText,
          translated: res.translatedText ?? "",
        });
        await pushAndSpeak({
          sourceText: res.sourceText,
          translatedText: res.translatedText ?? "",
          mode: res.mode,
        });
      } catch {
        setSoftNotice(true);
        const demo = demoVisionAssist(
          { sourceLocale, targetLocale },
          mode,
        );
        setOverlay({
          source: demo.sourceText,
          translated: demo.translatedText,
        });
        await pushAndSpeak({
          sourceText: demo.sourceText,
          translatedText: demo.translatedText,
          mode: "demo",
        });
      }
    } finally {
      setBusy(false);
    }
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
    <div className="relative mx-auto max-w-5xl px-6 pb-28 pt-6 md:px-10 md:pt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden"
      >
        <div
          className="animate-drift absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 70% 55% at 78% 18%, rgba(47, 107, 255, 0.18), transparent 58%),
              radial-gradient(ellipse 50% 40% at 12% 0%, rgba(96, 165, 250, 0.14), transparent 52%),
              linear-gradient(180deg, #dbe8ff 0%, transparent 78%)
            `,
          }}
        />
        <div className="bp-topo absolute inset-0 opacity-50" />
      </div>

      <header className="animate-rise border-b border-[color:var(--bp-line)] pb-8">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-river">
          {brandSecondary}
        </p>
        <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,3.75rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink">
          {brandPrimary}
        </h1>
        <p className="mt-4 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-ink-soft">
          {t(locale, "translate.eyebrow")}
        </p>
        <p className="mt-2 max-w-xl font-display text-2xl font-semibold tracking-tight text-ink/90 md:text-3xl">
          {t(locale, "translate.title")}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
          {t(locale, "translate.webSupport")}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-bp-xs px-2.5 py-1 font-semibold ${
              isDemo
                ? "bg-river/12 text-river-deep"
                : "bg-river text-foam"
            }`}
          >
            {isDemo
              ? t(locale, "translate.demoBadge")
              : t(locale, "translate.liveBadge")}
          </span>
          <span className="rounded-bp-xs bg-mist px-2.5 py-1 font-medium text-river-deep">
            {t(locale, "translate.streamingBadge")}
          </span>
          <span className="rounded-bp-xs bg-mist px-2.5 py-1 font-medium text-ink-soft">
            {online
              ? t(locale, "offline.online")
              : t(locale, "translate.offlineBadge")}
          </span>
          <span className="rounded-bp-xs bg-foam/80 px-2.5 py-1 font-medium text-ink-soft ring-1 ring-[color:var(--bp-line)]">
            {t(locale, "translate.asrReady")} · {status?.asr ?? "…"}
          </span>
          <span className="rounded-bp-xs bg-foam/80 px-2.5 py-1 font-medium text-ink-soft ring-1 ring-[color:var(--bp-line)]">
            {t(locale, "translate.ttsReady")} · {status?.tts ?? "…"}
          </span>
          {!status ? (
            <span className="text-ink-soft/70">
              {t(locale, "translate.loading")}
            </span>
          ) : null}
        </div>

        {isDemo ? (
          <SoftFailNotice className="mt-4">
            {softNotice && !online
              ? t(locale, "translate.softOffline")
              : t(locale, "translate.demoNotice")}
          </SoftFailNotice>
        ) : null}
      </header>

      <div
        className="animate-rise mt-8 flex gap-2 rounded-xl bg-mist/70 p-1.5"
        style={{ animationDelay: "40ms" }}
        role="tablist"
        aria-label={t(locale, "translate.title")}
      >
        {(
          [
            ["conversation", "translate.mode.conversation"],
            ["camera", "translate.mode.camera"],
          ] as const
        ).map(([id, key]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              if (id === "camera") {
                if (cameraStreamRef.current && videoRef.current) {
                  videoRef.current.srcObject = cameraStreamRef.current;
                  void videoRef.current.play();
                } else if (!cameraReady) {
                  void startCamera();
                }
              }
            }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? "bg-river text-foam shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {t(locale, key)}
          </button>
        ))}
      </div>

      <section
        className="animate-rise mt-6"
        style={{ animationDelay: "80ms" }}
        aria-label={t(locale, "translate.pairLabel")}
      >
        <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-river">
          {t(locale, "translate.pairLabel")}
        </p>
        <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
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
            className="mt-6 flex h-11 w-11 shrink-0 items-center justify-center justify-self-center rounded-full bg-river text-foam shadow-sm transition hover:bg-river-deep"
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
      </section>

      {error ? (
        <p className="mt-4 text-sm text-timber">{error}</p>
      ) : null}

      {tab === "conversation" ? (
        <>
          {(listening || partialText) && (
            <p className="animate-sheet-in mt-6 rounded-bp-sm border border-river/20 bg-foam/90 px-4 py-3 text-sm text-river-deep">
              <span className="mr-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-river">
                {t(locale, "translate.partialHint")}
              </span>
              {partialText || "…"}
            </p>
          )}

          <div
            className="animate-rise mt-8 space-y-0"
            style={{ animationDelay: "120ms" }}
          >
            {turns.length === 0 ? (
              <p className="border-y border-[color:var(--bp-line)] py-12 text-ink-soft">
                {t(locale, "translate.empty")}
              </p>
            ) : (
              turns.map((row, idx) => (
                <article
                  key={row.id}
                  className="animate-turn-in border-b border-[color:var(--bp-line)] py-5"
                  style={{ animationDelay: `${Math.min(idx, 4) * 40}ms` }}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                        {t(locale, "translate.source")}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                        {row.sourceText}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river">
                        {t(locale, "translate.target")}
                      </p>
                      <p className="mt-1.5 font-display text-xl leading-snug tracking-tight text-ink md:text-2xl">
                        {row.translatedText}
                      </p>
                    </div>
                  </div>
                  {row.mode === "offline" ? (
                    <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                      {t(locale, "translate.offlineBadge")}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <section
            className="animate-rise mt-12"
            style={{ animationDelay: "140ms" }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl tracking-tight text-ink">
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
                  className={`rounded-bp-sm px-3 py-1.5 text-xs font-medium transition ${
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
                    <span className="text-sm text-ink-soft">
                      {phrase.sourceText}
                    </span>
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
                            void removeQueuedTranslation(
                              queueStore,
                              item.id,
                            ).then(refreshQueue)
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
                className="mt-3 rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-3 py-2 text-xs font-medium text-river disabled:opacity-40"
              >
                {t(locale, "translate.queueFlush")}
              </button>
            </div>
          </section>
        </>
      ) : (
        <section
          className="animate-sheet-in mt-6"
          aria-label={t(locale, "translate.mode.camera")}
        >
          <p className="mb-3 text-sm text-ink-soft">
            {t(locale, "translate.dualHint")}
          </p>
          <div className="grid overflow-hidden rounded-2xl border border-[color:var(--bp-line)] bg-ink shadow-[0_20px_50px_rgba(15,23,42,0.12)] md:grid-cols-2">
            <div className="relative min-h-[220px] border-b border-white/10 md:min-h-[320px] md:border-b-0 md:border-r">
              <div
                className="animate-lens-breathe absolute inset-0"
                style={{
                  backgroundImage: `
                    radial-gradient(ellipse 60% 50% at 40% 35%, rgba(47,107,255,0.45), transparent 60%),
                    linear-gradient(160deg, #1a4fd6 0%, #0f172a 70%)
                  `,
                }}
              />
              <div className="bp-topo absolute inset-0 opacity-30" />
              <div className="absolute left-3 top-3 rounded-bp-sm bg-black/35 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-foam backdrop-blur-sm">
                {t(locale, "translate.lensYou")} ·{" "}
                {t(locale, "translate.cameraFront")}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-20 w-20 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm" />
              </div>
            </div>

            <div className="relative min-h-[220px] md:min-h-[320px]">
              {cameraReady ? (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className={`absolute inset-0 h-full w-full object-cover ${
                    facing === "user" ? "scale-x-[-1]" : ""
                  }`}
                />
              ) : (
                <>
                  <div
                    className="animate-lens-breathe absolute inset-0"
                    style={{
                      backgroundImage: `
                        radial-gradient(ellipse 70% 55% at 70% 40%, rgba(96,165,250,0.35), transparent 55%),
                        linear-gradient(200deg, #334155 0%, #0f172a 85%)
                      `,
                    }}
                  />
                  <div className="bp-topo absolute inset-0 opacity-40" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm text-foam/80">
                      {t(locale, "translate.cameraHint")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="rounded-bp-sm bg-river px-4 py-2 text-sm font-semibold text-foam"
                    >
                      {t(locale, "translate.enableCamera")}
                    </button>
                  </div>
                </>
              )}
              <div className="absolute left-3 top-3 rounded-bp-sm bg-black/35 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-foam backdrop-blur-sm">
                {t(locale, "translate.lensWorld")} ·{" "}
                {facing === "environment"
                  ? t(locale, "translate.cameraBack")
                  : t(locale, "translate.cameraFront")}
              </div>
              {overlay ? (
                <div className="absolute inset-x-3 bottom-3 rounded-xl bg-ink/75 px-4 py-3 backdrop-blur-md">
                  <p className="text-xs text-foam/70">{overlay.source}</p>
                  {overlay.translated ? (
                    <p className="mt-1 font-display text-lg font-semibold leading-snug text-foam">
                      {overlay.translated}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                void startCamera(next);
              }}
              className="rounded-bp-sm border border-[color:var(--bp-line)] bg-foam px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:border-river/30 hover:text-river"
            >
              {facing === "environment"
                ? t(locale, "translate.cameraFront")
                : t(locale, "translate.cameraBack")}
            </button>
            <button
              type="button"
              onClick={() => void onVision("ocr")}
              disabled={busy}
              className="rounded-bp-sm bg-river px-4 py-2.5 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:opacity-50"
            >
              {t(locale, "translate.ocr")}
            </button>
            <button
              type="button"
              onClick={() => void onVision("caption")}
              disabled={busy}
              className="rounded-bp-sm bg-river-deep px-4 py-2.5 text-sm font-semibold text-foam transition hover:bg-ink disabled:opacity-50"
            >
              {t(locale, "translate.caption")}
            </button>
          </div>
        </section>
      )}

      {tab === "conversation" ? (
        <div
          className="animate-rise sticky bottom-0 mt-10 -mx-6 border-t border-[color:var(--bp-line)] bg-foam/85 px-6 py-4 backdrop-blur-md md:-mx-10 md:px-10"
          style={{ animationDelay: "160ms" }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setTtsEnabled((v) => !v)}
              className={`rounded-bp-sm px-3 py-1.5 text-xs font-semibold transition ${
                ttsEnabled
                  ? "bg-river/12 text-river-deep"
                  : "bg-mist text-ink-soft"
              }`}
              aria-pressed={ttsEnabled}
            >
              {t(locale, "translate.ttsReady")}{" "}
              {ttsEnabled ? "· on" : "· off"}
            </button>
            <span className="text-[11px] text-ink-soft/60">{apiBase()}</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSend();
              }}
              placeholder={t(locale, "translate.typeHint")}
              className="flex-1 rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-focus focus:ring-2"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={busy}
              className="rounded-bp-sm bg-river px-4 py-2.5 text-sm font-medium text-foam transition hover:bg-river-deep disabled:opacity-50"
            >
              {busy
                ? t(locale, "translate.translating")
                : t(locale, "translate.send")}
            </button>
            <button
              type="button"
              onClick={() => void onQueueDraft()}
              disabled={busy || !draft.trim()}
              className="rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-4 py-2.5 text-sm font-medium text-river disabled:opacity-50"
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
              className={`min-w-[10rem] flex-1 rounded-bp-sm px-4 py-3 text-sm font-semibold text-foam transition disabled:opacity-50 ${
                listening ? "bg-ink" : "bg-river hover:bg-river-deep"
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
              className="rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-4 py-3 text-sm font-medium text-river transition hover:border-river/40 disabled:opacity-50"
            >
              {t(locale, "translate.nextDemo")}
            </button>
          </div>
        </div>
      ) : null}
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
    <label className="block rounded-xl border border-[color:var(--bp-line)] bg-foam/90 p-3 shadow-sm backdrop-blur-sm">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TranslationLocale)}
        className="mt-2 w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-3 py-2.5 text-sm font-medium text-ink outline-none ring-focus focus:ring-2"
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
