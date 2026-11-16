"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TRANSLATION_LOCALES,
  localeLabel,
  swapPair,
  type TranslationLocale,
} from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { apiBase, apiGet, apiSend } from "@/lib/api";

type Status = {
  mode: "live" | "demo";
  asr: string;
  llm: string;
  tts: string;
  vision: string;
  featureEnabled: boolean;
  locales: string[];
};

type Turn = {
  id: string;
  sourceText: string;
  translatedText: string;
  mode: "live" | "demo";
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

export function LiveAssist({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [sourceLocale, setSourceLocale] = useState<TranslationLocale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<TranslationLocale>("en");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoIndex, setDemoIndex] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
        }),
      );
  }, []);

  const pushAndSpeak = useCallback(
    async (res: TurnResponse) => {
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
      setDemoIndex((i) => i + 1);
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
    try {
      const res = await apiSend<TurnResponse>("/v1/translation/turn", "POST", {
        ...input,
        sourceLocale,
        targetLocale,
        withTts: true,
        demoTurnIndex: demoIndex,
      });
      await pushAndSpeak(res);
    } catch {
      setError(t(locale, "translate.error"));
    } finally {
      setBusy(false);
    }
  }

  async function startMic() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
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
      recorder.start();
      setListening(true);
    } catch {
      // Still allow demo turns without mic permission
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
    }
  }

  async function onSend() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await runTurn({ text });
  }

  const locales = (status?.locales as TranslationLocale[] | undefined) ?? [
    ...TRANSLATION_LOCALES,
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-8 md:px-10">
      <div className="animate-rise">
        <p className="text-sm uppercase tracking-[0.2em] text-river-deep/80">
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
          locales={locales}
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
          locales={locales}
          ui={locale}
          onChange={setTargetLocale}
        />
      </div>

      {error ? (
        <p className="mt-4 text-sm text-timber">{error}</p>
      ) : null}

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
            </article>
          ))
        )}
      </div>

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
            {busy ? t(locale, "translate.translating") : t(locale, "translate.send")}
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
  ui,
  onChange,
}: {
  label: string;
  value: TranslationLocale;
  locales: TranslationLocale[];
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
          </option>
        ))}
      </select>
    </label>
  );
}
