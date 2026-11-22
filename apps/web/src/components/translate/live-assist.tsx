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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
  softFailRailClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import {
  DualCameraSkeleton,
  Skeleton,
  TranslateHistorySkeleton,
  TranslateStatusSkeleton,
} from "@/components/ui/skeleton";
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

/** Craft SoftFail query: `?…SoftFail=1` — SoftFail depth without a transport miss. */
function craftSoftFailOn(param: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(param) === "1";
  } catch {
    return false;
  }
}

export function LiveAssist({ locale }: { locale: Locale }) {
  const queueStore = useMemo(() => createWebOfflineQueueStore(), []);
  /** Craft SoftFail query residual (BEA-429): empty / talk / dual / banner. */
  const [emptySoftPreview] = useState(() => craftSoftFailOn("emptySoftFail"));
  const [talkSoftPreview] = useState(() => craftSoftFailOn("talkSoftFail"));
  const [dualSoftPreview] = useState(() => craftSoftFailOn("dualSoftFail"));
  const [bannerSoftPreview] = useState(() => craftSoftFailOn("bannerSoftFail"));
  const [status, setStatus] = useState<Status | null>(null);
  const [softNotice, setSoftNotice] = useState(false);
  /** Dual craft opens camera; empty/talk craft stay on conversation (no double depth). */
  const [tab, setTab] = useState<Tab>(() =>
    dualSoftPreview && !emptySoftPreview && !talkSoftPreview
      ? "camera"
      : "conversation",
  );
  const [sourceLocale, setSourceLocale] = useState<TranslationLocale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<TranslationLocale>("en");
  const [draft, setDraft] = useState("");
  /**
   * Empty first paint — empty SoftFail owns history chrome (BEA-310).
   * Talk / banner craft seed demo turns so SoftFail can own (empty yields).
   */
  const [turns, setTurns] = useState<Turn[]>(() =>
    (talkSoftPreview || bannerSoftPreview) && !emptySoftPreview
      ? seedTurns("zh-CN", "en")
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoIndex, setDemoIndex] = useState(() =>
    (talkSoftPreview || bannerSoftPreview) && !emptySoftPreview ? 2 : 0,
  );
  const [online, setOnline] = useState(true);
  const [phrases, setPhrases] = useState<PhrasebookLookup[]>([]);
  const [phraseCategory, setPhraseCategory] =
    useState<PhraseCategory>("greetings");
  const [queue, setQueue] = useState<QueuedTranslation[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [facing, setFacing] = useState<Facing>("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const micRef = useRef<HTMLButtonElement | null>(null);
  const draftRef = useRef<HTMLInputElement | null>(null);
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
  /**
   * Empty SoftFailNotice depth (BEA-310 after #81) + craft SoftFail query
   * residual parity (BEA-429 / Expo #301):
   * empty owns compact SoftFail under azure history rail · Soft empty badge ·
   * emptySupport · emptySoftFail copy (never inherit Assist softNotice) ·
   * mist SoftFail band (`border-b`) · SheetPresence empty body · tip-011 (#46).
   * Assist + Talk SoftFail yield while empty owns (no double depth). Craft:
   * `/translate?emptySoftFail=1`. Soft copy never timber / Failed to fetch.
   */
  const historyEmpty = turns.length === 0;
  const emptyOwnsSoft = tab === "conversation" && historyEmpty;
  const emptySoftOpen = emptyOwnsSoft;
  /** SoftFail copy owned by empty chrome — never inherit softNotice / timber. */
  const emptySoftCopy = t(locale, "translate.emptySoftFail");
  /**
   * Talk SoftFail depth + Expo-web SoftFail depth parity residual (BEA-442
   * after #322 compact mist band): azure Talk rail · SoftFailBadge Soft talk ·
   * SoftFailSupport · compact SoftFailNotice mist band · tip-011 mist-wash
   * compose. Craft: `/translate?talkSoftFail=1` seeds demo turns so Talk
   * SoftFail can own (empty yields). SoftFail copy always talkSoftFail when
   * craft — never timber / Failed to fetch.
   */
  const talkSoftOpen =
    tab === "conversation" &&
    !emptyOwnsSoft &&
    (talkSoftPreview || Boolean(micDenied || error));
  const talkSoftCopy = talkSoftPreview
    ? t(locale, "translate.talkSoftFail")
    : micDenied
      ? t(locale, "translate.permissionMic")
      : (error ?? t(locale, "translate.error"));
  /**
   * Dual / camera SoftFail depth + Expo-web SoftFail depth parity residual
   * (BEA-442 after #322 compact mist band): azure dual rail · SoftFailBadge
   * Soft dual · SoftFailSupport · compact SoftFailNotice mist band · tip-011
   * mist-wash stage. Craft: `/translate?dualSoftFail=1` opens camera tab
   * SoftFail. SoftFail copy always dualSoftFail when craft — never timber /
   * Failed to fetch.
   */
  const dualSoftOpen =
    tab === "camera" && (dualSoftPreview || cameraDenied);
  const dualSoftCopy = dualSoftPreview
    ? t(locale, "translate.dualSoftFail")
    : t(locale, "translate.permissionCamera");
  /**
   * Offline banner SoftFailNotice depth (BEA-309 after #87; yield BEA-414) +
   * SoftFailSupport residual (BEA-433) + craft SoftFail query residual
   * (BEA-429): azure SoftFail sheet · SoftFailBadge / SoftFailLiveBadge ·
   * SoftFailSupport · compact SoftFailNotice (border-b) · mist-wash status
   * body · tip-011. Craft: `/translate?bannerSoftFail=1`. SoftFail yields
   * while empty history owns soft-fail; yields while Talk SoftFail or camera
   * SoftFail owns (Expo #335 / #281 yield — no double SoftFail depth). Soft
   * copy never timber / Failed to fetch.
   */
  const bannerSoftOpen =
    (bannerSoftPreview || isDemo) &&
    !emptyOwnsSoft &&
    !talkSoftOpen &&
    !dualSoftOpen;
  const bannerSoftCopy = bannerSoftPreview
    ? t(locale, "translate.demoNotice")
    : softNotice && !online
      ? t(locale, "translate.softOffline")
      : t(locale, "translate.demoNotice");
  const bannerBadge = !online
    ? t(locale, "translate.offlineBadge")
    : bannerSoftPreview || isDemo
      ? t(locale, "translate.softBadge")
      : t(locale, "translate.liveBadge");

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
    /** Empty SoftFail craft keeps history empty so empty SoftFail owns. */
    if (emptySoftPreview && !talkSoftPreview && !bannerSoftPreview) {
      setTurns([]);
      setDemoIndex(0);
    } else if (
      (talkSoftPreview || bannerSoftPreview) &&
      !emptySoftPreview
    ) {
      setTurns(seedTurns(sourceLocale, targetLocale));
      setDemoIndex(2);
    } else {
      setTurns(seedTurns(sourceLocale, targetLocale));
      setDemoIndex(2);
    }
    setOverlay(null);
  }, [
    sourceLocale,
    targetLocale,
    emptySoftPreview,
    talkSoftPreview,
    bannerSoftPreview,
  ]);

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
    setMicDenied(false);
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
      setMicDenied(false);
    } catch {
      stopDeviceInterim();
      setMicDenied(true);
      setSoftNotice(true);
      await runTurn({});
    }
  }

  function focusComposer(mode: "mic" | "draft" = "mic") {
    if (mode === "draft") {
      draftRef.current?.focus();
      draftRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    micRef.current?.focus();
    micRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    setCameraStarting(true);
    setCameraDenied(false);
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
      setCameraDenied(false);
    } catch {
      setCameraReady(false);
      setCameraDenied(true);
      setSoftNotice(true);
    } finally {
      setCameraStarting(false);
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

        {/*
          Offline banner SoftFail depth (BEA-309 after #87) + SoftFailSupport
          residual (BEA-433) + craft SoftFail residual (BEA-429): azure SoftFail
          sheet · SoftFailBadge / SoftFailLiveBadge · SoftFailSupport · compact
          SoftFailNotice · mist-wash status chips · tip-011. Craft:
          ?bannerSoftFail=1 — SoftFail yields while empty / Talk / camera
          SoftFail own — never timber / Failed to fetch.
        */}
        <div
          className="animate-rise mt-5 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
          style={{ animationDelay: "40ms" }}
          aria-label={t(locale, "translate.bannerEyebrow")}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "translate.bannerEyebrow")}
              </span>
              {bannerSoftOpen ? (
                <SoftFailSupport>
                  {t(locale, "translate.softSupport")}
                </SoftFailSupport>
              ) : (
                <span className="text-[11px] leading-snug text-ink-soft/80">
                  {t(locale, "translate.bannerSupport")}
                </span>
              )}
            </div>
            {!online || bannerSoftOpen ? (
              <SoftFailBadge className="transition duration-bp-fast ease-bp-out">
                {bannerBadge}
              </SoftFailBadge>
            ) : (
              <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                {bannerBadge}
              </SoftFailLiveBadge>
            )}
          </div>

          {/* Compact SoftFail under azure rail — yields while empty / Talk / camera SoftFail own. */}
          <SoftFailNotice
            open={bannerSoftOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {bannerSoftCopy}
          </SoftFailNotice>

          <div
            className={`animate-rise px-4 py-3 sm:px-5 ${
              bannerSoftOpen ? softFailMistWashClass : ""
            }`}
            style={{ animationDelay: "70ms" }}
          >
            {!status ? (
              <TranslateStatusSkeleton />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs">
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
                  {t(locale, "translate.asrReady")} · {status.asr}
                </span>
                <span className="rounded-bp-xs bg-foam/80 px-2.5 py-1 font-medium text-ink-soft ring-1 ring-[color:var(--bp-line)]">
                  {t(locale, "translate.ttsReady")} · {status.tts}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/*
        Live panel craft residual (BEA-515 wave 53): mode tabs tip-011 press ·
        pair eyebrow 0.18em · swap tip-011. SoftFail / history (#353) untouched.
      */}
      <div
        className="animate-rise mt-8 flex gap-2 rounded-bp bg-mist/70 p-1.5"
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
                } else if (!cameraReady && !cameraStarting) {
                  void startCamera();
                }
              }
            }}
            className={`bp-transition flex-1 rounded-bp-sm px-4 py-2.5 text-sm font-semibold duration-bp-fast ease-bp-out active:scale-[0.98] ${
              tab === id
                ? "bg-river text-foam shadow-bp-soft"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {t(locale, key)}
          </button>
        ))}
      </div>

      <section
        className="animate-rise mt-6 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp"
        style={{ animationDelay: "80ms" }}
        aria-label={t(locale, "translate.pairLabel")}
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/60 px-5 py-4 md:px-6">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
              {t(locale, "translate.pairLabel")}
            </p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
              {t(locale, "translate.pairHint")}
            </p>
          </div>
          <span className="rounded-bp-xs bg-mist px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-river-deep">
            {localeLabel(sourceLocale, locale === "en" ? "en" : "zh-CN")}
            {" → "}
            {localeLabel(targetLocale, locale === "en" ? "en" : "zh-CN")}
          </span>
        </div>
        <div className="grid items-stretch gap-3 px-5 py-5 sm:grid-cols-[1fr_auto_1fr] md:px-6">
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
            className="bp-transition mt-6 flex h-11 w-11 shrink-0 items-center justify-center justify-self-center rounded-full bg-river text-foam shadow-bp-soft duration-bp-fast ease-bp-out hover:bg-river-deep active:scale-[0.98]"
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

          {/*
            SoftFail depth kept (BEA-310 / SoftFailSupport BEA-433 /
            craft query BEA-429) + wave 51 list craft (#353 / BEA-491) +
            wave 57 residual (BEA-548): count chip 0.14em · empty title
            leading-snug. SoftFail reopen out of scope. Craft:
            ?emptySoftFail=1 — never timber / Failed to fetch. No `/dev`
            gallery.
          */}
          <section
            className="animate-rise mt-8 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp"
            style={{ animationDelay: "120ms" }}
            aria-label={t(locale, "translate.history")}
          >
            <header className="relative flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/60 px-5 py-4 shadow-[inset_3px_0_0_var(--bp-river)] md:px-6">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                    {t(locale, "translate.history")}
                  </p>
                  {historyEmpty ? (
                    emptySoftOpen ? (
                      <SoftFailSupport>
                        {t(locale, "translate.emptySoftSupport")}
                      </SoftFailSupport>
                    ) : (
                      <span className="text-[11px] leading-snug text-ink-soft/80">
                        {t(locale, "translate.emptySupport")}
                      </span>
                    )
                  ) : null}
                </div>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
                  {historyEmpty
                    ? t(locale, "translate.emptyHint")
                    : t(locale, "translate.historyHint")}
                </p>
              </div>
              {historyEmpty ? (
                emptySoftOpen ? (
                  <SoftFailBadge>
                    {t(locale, "translate.emptySoftBadge")}
                  </SoftFailBadge>
                ) : (
                  <SoftFailLiveBadge>
                    {t(locale, "translate.emptyBadge")}
                  </SoftFailLiveBadge>
                )
              ) : (
                <span className="rounded-bp-xs bg-mist px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-river-deep">
                  {t(locale, "translate.historyCount").replace(
                    "{n}",
                    String(turns.length),
                  )}
                </span>
              )}
            </header>

            {/* Compact SoftFail under azure rail — empty owns emptySoftFail; never timber / Failed to fetch. */}
            <SoftFailNotice
              open={emptySoftOpen}
              compact
              className="border-b border-[color:var(--bp-line)]"
            >
              {emptySoftCopy}
            </SoftFailNotice>

            {busy && historyEmpty ? (
              <TranslateHistorySkeleton rows={2} emptySoft />
            ) : historyEmpty ? (
              <SheetPresence
                open
                className={`max-w-lg px-5 py-10 md:px-6 ${
                  emptySoftOpen
                    ? "rounded-bp-sm bg-mist/25 shadow-[inset_3px_0_0_var(--bp-river)]"
                    : ""
                }`}
                style={{ animationDelay: "40ms" }}
                aria-label={t(locale, "translate.empty")}
              >
                <p
                  className="animate-rise text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river"
                  style={{ animationDelay: "40ms" }}
                >
                  {t(locale, "translate.history")}
                </p>
                <p
                  className="animate-rise mt-2 font-display text-2xl font-semibold leading-snug tracking-tight text-ink md:text-3xl"
                  style={{ animationDelay: "70ms" }}
                >
                  {t(locale, "translate.empty")}
                </p>
                <p
                  className="animate-rise mt-3 text-sm leading-relaxed text-ink-soft"
                  style={{ animationDelay: "100ms" }}
                >
                  {t(locale, "translate.emptyHint")}
                </p>
                <div
                  className="animate-rise mt-7 flex flex-wrap gap-3"
                  style={{ animationDelay: "130ms" }}
                >
                  <button
                    type="button"
                    onClick={() => focusComposer("mic")}
                    className="rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                  >
                    {t(locale, "translate.emptyCta")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runTurn({})}
                    disabled={busy}
                    className="rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-4 py-3 text-sm font-medium text-river transition duration-bp-fast ease-bp-out hover:border-river/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 disabled:opacity-50"
                  >
                    {t(locale, "translate.nextDemo")}
                  </button>
                </div>
              </SheetPresence>
            ) : (
              <div className="divide-y divide-[color:var(--bp-line)]">
                {busy ? (
                  <div className="border-b border-[color:var(--bp-line)]">
                    <TranslateHistorySkeleton rows={1} />
                  </div>
                ) : null}
                {turns.map((row, idx) => (
                  <article
                    key={row.id}
                    className="animate-turn-in px-5 py-5 md:px-6"
                    style={{ animationDelay: `${Math.min(idx, 4) * 40}ms` }}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-bp-xs px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${
                          row.mode === "live"
                            ? "bg-river text-foam"
                            : row.mode === "offline"
                              ? "bg-mist text-ink-soft"
                              : "bg-river/12 text-river-deep"
                        }`}
                      >
                        {row.mode === "live"
                          ? t(locale, "translate.liveBadge")
                          : row.mode === "offline"
                            ? t(locale, "translate.offlineBadge")
                            : t(locale, "translate.demoBadge")}
                      </span>
                      {row.translatedText ? (
                        <button
                          type="button"
                          onClick={() =>
                            void speakLocal(row.translatedText, targetLocale)
                          }
                          className="ml-auto text-[11px] font-medium uppercase tracking-[0.14em] text-river transition duration-bp-fast ease-bp-out hover:text-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                        >
                          {t(locale, "translate.speak")}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                          {t(locale, "translate.source")}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                          {row.sourceText}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                          {t(locale, "translate.target")}
                        </p>
                        <p className="mt-1.5 font-display text-xl leading-snug tracking-tight text-ink md:text-2xl">
                          {row.translatedText}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/*
            Phrasebook live craft residual (BEA-515): title leading-snug ·
            category tip-011 · phrase row press · queue flush tip-011.
            SoftFail / history list (#353) out of scope.
          */}
          <section
            className="animate-rise mt-12"
            style={{ animationDelay: "140ms" }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl leading-snug tracking-tight text-ink">
                  {t(locale, "translate.phrasebook")}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
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
                  className={`bp-transition rounded-bp-sm px-3 py-1.5 text-xs font-medium duration-bp-fast ease-bp-out active:scale-[0.98] ${
                    phraseCategory === cat
                      ? "bg-river text-foam shadow-bp-soft"
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
                    className="bp-transition flex w-full flex-col items-start gap-1 py-3 text-left duration-bp-fast ease-bp-out hover:bg-mist/40 active:scale-[0.98]"
                  >
                    <span className="text-sm leading-relaxed text-ink-soft">
                      {phrase.sourceText}
                    </span>
                    <span className="font-medium leading-snug text-ink">
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
                          className="bp-transition text-xs text-ink-soft duration-bp-fast ease-bp-out hover:text-river active:scale-[0.98]"
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
                className="bp-transition mt-3 rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-3 py-2 text-xs font-medium text-river duration-bp-fast ease-bp-out hover:border-river/40 active:scale-[0.98] disabled:opacity-40"
              >
                {t(locale, "translate.queueFlush")}
              </button>
            </div>
          </section>
        </>
      ) : (
        <section
          className="animate-rise mt-6 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp"
          style={{ animationDelay: "120ms" }}
          aria-label={t(locale, "translate.mode.camera")}
        >
          {/*
            Dual SoftFail depth + Expo-web SoftFail depth parity (BEA-442 after
            #322): azure dual rail · SoftFailBadge Soft dual · SoftFailSupport ·
            compact SoftFailNotice mist band · tip-011 mist-wash stage. Craft:
            ?dualSoftFail=1 — never timber / Failed to fetch.
          */}
          <header
            className={`relative flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] px-5 py-4 shadow-[inset_3px_0_0_var(--bp-river)] md:px-6 ${
              dualSoftOpen ? softFailRailClass : "bg-paper/60"
            }`}
          >
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "translate.mode.camera")}
              </p>
              {dualSoftOpen ? (
                <div className="mt-1 max-w-lg">
                  <SoftFailSupport>
                    {t(locale, "translate.dualSoftSupport")}
                  </SoftFailSupport>
                </div>
              ) : (
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-soft">
                  {t(locale, "translate.dualHint")}
                </p>
              )}
            </div>
            {dualSoftOpen ? (
              <SoftFailBadge>
                {t(locale, "translate.dualSoftBadge")}
              </SoftFailBadge>
            ) : (
              <SoftFailLiveBadge>
                {t(locale, "translate.dualLiveBadge")}
              </SoftFailLiveBadge>
            )}
          </header>

          {/* Compact SoftFail mist band under azure dual rail — never timber. */}
          <SoftFailNotice
            open={dualSoftOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {dualSoftCopy}
          </SoftFailNotice>

          {cameraStarting && !cameraReady ? (
            <div className={dualSoftOpen ? softFailMistWashClass : undefined}>
              <DualCameraSkeleton />
            </div>
          ) : (
            <SheetPresence
              open
              className={dualSoftOpen ? softFailMistWashClass : undefined}
              style={{ animationDelay: "40ms" }}
              aria-label={t(locale, "translate.dualHint")}
            >
              {/*
                Wave 55 Dual residual (BEA-531 beyond live #369 / history #353):
                lens badges · source footer · overlay target · control meta →
                0.18em tracking (history source/target bar). SoftFail untouched.
              */}
              <div className="grid md:grid-cols-2">
                {/* Traveler lens */}
                <div className="relative isolate min-h-[240px] border-b border-[color:var(--bp-line)] md:min-h-[340px] md:border-b-0 md:border-r">
                  <div
                    className="animate-lens-breathe absolute inset-0"
                    style={{
                      backgroundImage: `
                        radial-gradient(ellipse 60% 50% at 40% 35%, rgba(47,107,255,0.42), transparent 60%),
                        linear-gradient(160deg, #1a4fd6 0%, #0f172a 72%)
                      `,
                    }}
                  />
                  <div className="bp-topo absolute inset-0 opacity-30" />
                  <div className="absolute left-3 top-3 z-10 rounded-bp-xs bg-ink/45 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foam backdrop-blur-sm ring-1 ring-white/15">
                    {t(locale, "translate.lensYou")} ·{" "}
                    {t(locale, "translate.cameraFront")}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full border border-white/30 bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-sm">
                      <div className="h-14 w-14 rounded-full bg-river/35 ring-2 ring-foam/25" />
                    </div>
                  </div>
                  <p className="absolute inset-x-3 bottom-3 z-10 text-center text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foam/65">
                    {t(locale, "translate.source")}
                  </p>
                </div>

                {/* World lens */}
                <div className="relative isolate min-h-[240px] bg-ink md:min-h-[340px]">
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
                            radial-gradient(ellipse 70% 55% at 70% 40%, rgba(96,165,250,0.32), transparent 55%),
                            linear-gradient(200deg, #334155 0%, #0f172a 88%)
                          `,
                        }}
                      />
                      <div className="bp-topo absolute inset-0 opacity-35" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                        <p className="max-w-xs text-sm leading-relaxed text-foam/80">
                          {cameraDenied
                            ? t(locale, "translate.permissionCamera")
                            : t(locale, "translate.cameraHint")}
                        </p>
                        <button
                          type="button"
                          onClick={() => void startCamera()}
                          className="bp-transition rounded-bp-sm bg-river px-4 py-2.5 text-sm font-semibold text-foam duration-bp-fast ease-bp-out hover:bg-river-deep active:scale-[0.98]"
                        >
                          {t(locale, "translate.enableCamera")}
                        </button>
                      </div>
                    </>
                  )}
                  <div className="absolute left-3 top-3 z-10 rounded-bp-xs bg-ink/45 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foam backdrop-blur-sm ring-1 ring-white/15">
                    {t(locale, "translate.lensWorld")} ·{" "}
                    {facing === "environment"
                      ? t(locale, "translate.cameraBack")
                      : t(locale, "translate.cameraFront")}
                  </div>

                  {busy && tab === "camera" && !overlay ? (
                    <div className="absolute inset-x-3 bottom-3 z-10 space-y-2 rounded-bp bg-ink/70 px-4 py-3 backdrop-blur-md ring-1 ring-white/10">
                      <Skeleton className="h-3 w-36 max-w-[60%] bg-white/20" />
                      <Skeleton className="h-5 w-52 max-w-full bg-white/25" />
                    </div>
                  ) : null}

                  {overlay ? (
                    <div className="animate-sheet-in absolute inset-x-3 bottom-3 z-10 rounded-bp bg-ink/78 px-4 py-3 backdrop-blur-md ring-1 ring-white/10">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foam/55">
                        {t(locale, "translate.target")}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-foam/70">
                        {overlay.source}
                      </p>
                      {overlay.translated ? (
                        <p className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-foam md:text-xl">
                          {overlay.translated}
                        </p>
                      ) : null}
                      {busy ? (
                        <div className="mt-2">
                          <Skeleton className="h-2.5 w-24 bg-white/20" />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Control chrome rail — Live dual (tip-011 press · Talk parity) */}
              <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--bp-line)] bg-paper/85 px-3 py-3 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => {
                    const next =
                      facing === "environment" ? "user" : "environment";
                    setFacing(next);
                    void startCamera(next);
                  }}
                  disabled={cameraStarting}
                  className="bp-transition rounded-bp-sm border border-[color:var(--bp-line)] bg-foam px-4 py-2.5 text-sm font-medium text-ink-soft duration-bp-fast ease-bp-out hover:border-river/30 hover:text-river active:scale-[0.98] disabled:opacity-50"
                >
                  {facing === "environment"
                    ? t(locale, "translate.cameraFront")
                    : t(locale, "translate.cameraBack")}
                </button>
                <button
                  type="button"
                  onClick={() => void onVision("ocr")}
                  disabled={busy || cameraStarting}
                  className="bp-transition rounded-bp-sm bg-river px-4 py-2.5 text-sm font-semibold text-foam shadow-bp-soft duration-bp-fast ease-bp-out hover:bg-river-deep active:scale-[0.98] disabled:opacity-50"
                >
                  {busy
                    ? t(locale, "translate.translating")
                    : t(locale, "translate.ocr")}
                </button>
                <button
                  type="button"
                  onClick={() => void onVision("caption")}
                  disabled={busy || cameraStarting}
                  className="bp-transition rounded-bp-sm bg-river-deep px-4 py-2.5 text-sm font-semibold text-foam duration-bp-fast ease-bp-out hover:bg-ink active:scale-[0.98] disabled:opacity-50"
                >
                  {t(locale, "translate.caption")}
                </button>
                <span className="ml-auto hidden text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft/70 sm:inline">
                  {cameraReady
                    ? t(locale, "translate.lensWorld")
                    : cameraDenied
                      ? t(locale, "translate.demoBadge")
                      : t(locale, "translate.loading")}
                </span>
              </div>
            </SheetPresence>
          )}
        </section>
      )}

      {tab === "conversation" ? (
        <div
          className="animate-rise sticky bottom-0 z-20 mt-10 -mx-6 overflow-hidden rounded-t-bp-lg border border-b-0 border-[color:var(--bp-line)] bg-foam/92 shadow-[0_-12px_40px_rgba(15,23,42,0.06)] backdrop-blur-md md:-mx-10"
          style={{ animationDelay: "160ms" }}
        >
          {/*
            Talk SoftFail depth + Expo-web SoftFail depth parity (BEA-442 after
            #322): azure Talk rail · SoftFailBadge Soft talk · SoftFailSupport ·
            compact SoftFailNotice mist band · tip-011 mist-wash compose. Craft:
            ?talkSoftFail=1 — yields while empty owns; never timber.
          */}
          <header
            className={`flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] px-6 py-3.5 shadow-[inset_3px_0_0_var(--bp-river)] md:px-10 ${
              talkSoftOpen ? softFailRailClass : "bg-paper/70"
            }`}
          >
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "translate.talkRail")}
              </p>
              {talkSoftOpen ? (
                <div className="mt-1 max-w-lg">
                  <SoftFailSupport>
                    {t(locale, "translate.talkSoftSupport")}
                  </SoftFailSupport>
                </div>
              ) : (
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-soft">
                  {t(locale, "translate.talkHint")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {talkSoftOpen ? (
                <SoftFailBadge>
                  {t(locale, "translate.talkSoftBadge")}
                </SoftFailBadge>
              ) : (
                <SoftFailLiveBadge>
                  {t(locale, "translate.talkLiveBadge")}
                </SoftFailLiveBadge>
              )}
              {/*
                Live Talk TTS chip residual (BEA-561 wave 58): tracking 0.14em
                · tip-011 press — parity with history mode chips (#390) / #369
                panel bar. SoftFail / history / Dual untouched.
              */}
              <button
                type="button"
                onClick={() => setTtsEnabled((v) => !v)}
                className={`bp-transition rounded-bp-xs px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] duration-bp-fast ease-bp-out active:scale-[0.98] ${
                  ttsEnabled
                    ? "bg-river/12 text-river-deep"
                    : "bg-mist text-ink-soft"
                }`}
                aria-pressed={ttsEnabled}
              >
                {t(locale, "translate.ttsReady")}{" "}
                {ttsEnabled ? "· on" : "· off"}
              </button>
              <span className="hidden text-[11px] text-ink-soft/55 sm:inline">
                {apiBase()}
              </span>
            </div>
          </header>

          {/* Compact SoftFail mist band under azure Talk rail — never timber. */}
          <SoftFailNotice
            open={talkSoftOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {talkSoftCopy}
          </SoftFailNotice>

          <div
            className={`space-y-3 px-6 py-4 md:px-10 ${
              talkSoftOpen ? softFailMistWashClass : ""
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onSend();
                }}
                placeholder={t(locale, "translate.typeHint")}
                className="bp-transition flex-1 rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-focus duration-bp-fast ease-bp-out focus:border-river/35 focus:ring-2"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void onSend()}
                disabled={busy}
                className="bp-transition rounded-bp-sm bg-river px-4 py-2.5 text-sm font-medium text-foam duration-bp-fast ease-bp-out hover:bg-river-deep active:scale-[0.98] disabled:opacity-50"
              >
                {busy
                  ? t(locale, "translate.translating")
                  : t(locale, "translate.send")}
              </button>
              <button
                type="button"
                onClick={() => void onQueueDraft()}
                disabled={busy || !draft.trim()}
                className="bp-transition rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-4 py-2.5 text-sm font-medium text-river duration-bp-fast ease-bp-out hover:border-river/40 active:scale-[0.98] disabled:opacity-50"
              >
                {t(locale, "translate.queueAdd")}
              </button>
            </div>

            <div className="flex flex-wrap items-stretch gap-3">
              <button
                ref={micRef}
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
                aria-pressed={listening}
                className={`bp-transition relative min-w-[12rem] flex-1 rounded-bp px-5 py-3.5 text-sm font-semibold text-foam duration-bp ease-bp-out disabled:opacity-50 ${
                  listening
                    ? "animate-hold-listen bg-ink"
                    : "bg-river shadow-bp-soft hover:bg-river-deep active:scale-[0.98]"
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
                className="bp-transition rounded-bp-sm border border-[color:var(--bp-line)] bg-paper px-4 py-3.5 text-sm font-medium text-river duration-bp-fast ease-bp-out hover:border-river/40 active:scale-[0.98] disabled:opacity-50"
              >
                {t(locale, "translate.nextDemo")}
              </button>
            </div>
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
    <label className="block rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/90 p-3 shadow-bp-soft backdrop-blur-sm">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TranslationLocale)}
        className="bp-transition mt-2 w-full rounded-bp-xs border border-[color:var(--bp-line)] bg-foam px-3 py-2.5 text-sm font-medium text-ink outline-none ring-focus duration-bp-fast ease-bp-out focus:border-river/35 focus:ring-2"
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
