import type {
  AsrProvider,
  TtsProvider,
  TranslationProvider,
  VisionAssistProvider,
} from "./ports.js";
import type {
  AsrRequest,
  AsrResult,
  TtsRequest,
  TtsResult,
  TranslationRequest,
  TranslationResult,
  VisionAssistRequest,
  VisionAssistResult,
} from "./types.js";

export type OpenAiCompatConfig = {
  apiKey: string;
  /** Default https://api.openai.com/v1 */
  baseUrl?: string;
  /** Chat model for translate + vision. */
  chatModel?: string;
  /** Whisper-compatible model. */
  asrModel?: string;
  /** TTS model (OpenAI tts-1 / tts-1-hd). */
  ttsModel?: string;
  ttsVoice?: string;
  fetch?: typeof fetch;
};

function base(cfg: OpenAiCompatConfig): string {
  return (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

function fetchImpl(cfg: OpenAiCompatConfig): typeof fetch {
  return cfg.fetch ?? fetch;
}

/** OpenAI-compatible chat completion translator. */
export class OpenAiTranslationProvider implements TranslationProvider {
  readonly id = "openai-llm";

  constructor(private readonly cfg: OpenAiCompatConfig) {}

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const model = this.cfg.chatModel ?? "gpt-4o-mini";
    const system = [
      "You are a travel live-interpretation assistant for Beaver Plan / 海狸旅行.",
      "Translate the user utterance accurately and naturally for spoken dialogue.",
      "Return ONLY the translation — no quotes, no labels, no commentary.",
      `Source locale: ${req.sourceLocale}. Target locale: ${req.targetLocale}.`,
      req.mode === "live"
        ? "Prefer concise spoken phrasing suitable for TTS."
        : "Preserve nuance for batch reading.",
    ].join(" ");

    const res = await fetchImpl(this.cfg)(`${base(this.cfg)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: req.text },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openai_translate_${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { text, provider: this.id };
  }
}

/** Whisper-compatible ASR (OpenAI /v1/audio/transcriptions). */
export class OpenAiWhisperAsrProvider implements AsrProvider {
  readonly id = "openai-whisper";

  constructor(private readonly cfg: OpenAiCompatConfig) {}

  async transcribe(req: AsrRequest): Promise<AsrResult> {
    const model = this.cfg.asrModel ?? "whisper-1";
    const form = new FormData();
    const ab = req.audio.buffer.slice(
      req.audio.byteOffset,
      req.audio.byteOffset + req.audio.byteLength,
    ) as ArrayBuffer;
    // Blob / FormData file typing differs across Workers vs RN; BFF-only path.
    const BlobCtor = Blob as unknown as new (
      parts: unknown[],
      opts?: { type?: string },
    ) => Blob;
    const blob = new BlobCtor([ab], {
      type: req.mimeType || "audio/webm",
    });
    const ext = extensionFor(req.mimeType);
    (
      form as unknown as {
        append: (name: string, value: Blob, fileName?: string) => void;
      }
    ).append("file", blob, `utterance.${ext}`);
    form.append("model", model);
    if (req.locale) {
      form.append("language", whisperLanguage(req.locale));
    }

    const res = await fetchImpl(this.cfg)(
      `${base(this.cfg)}/audio/transcriptions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
        body: form,
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openai_asr_${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? "").trim(), provider: this.id };
  }
}

/** OpenAI TTS (/v1/audio/speech). */
export class OpenAiTtsProvider implements TtsProvider {
  readonly id = "openai-tts";

  constructor(private readonly cfg: OpenAiCompatConfig) {}

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const model = this.cfg.ttsModel ?? "tts-1";
    const voice = req.voice ?? this.cfg.ttsVoice ?? "alloy";
    const res = await fetchImpl(this.cfg)(`${base(this.cfg)}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: req.text,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openai_tts_${res.status}: ${body.slice(0, 200)}`);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      audio: buf,
      mimeType: "audio/mpeg",
      provider: this.id,
      speakLocally: false,
    };
  }
}

/** Vision OCR / scene caption via chat completions + image. */
export class OpenAiVisionAssistProvider implements VisionAssistProvider {
  readonly id = "openai-vision";

  constructor(private readonly cfg: OpenAiCompatConfig) {}

  async assist(req: VisionAssistRequest): Promise<VisionAssistResult> {
    const model = this.cfg.chatModel ?? "gpt-4o-mini";
    const source = req.sourceLocale ?? "auto";
    const target = req.targetLocale;
    const task =
      req.mode === "ocr"
        ? "Extract all readable text from the image (menus, signs, labels). Preserve line breaks."
        : "Describe the travel scene in one short sentence for a live caption.";

    const instruct = [
      task,
      `Respond in locale ${source} first.`,
      target
        ? `Then on a new line after --- write the ${target} translation.`
        : "",
      "No other commentary.",
    ]
      .filter(Boolean)
      .join(" ");

    const b64 = bytesToBase64(req.image);
    const dataUrl = `data:${req.mimeType || "image/jpeg"};base64,${b64}`;

    const res = await fetchImpl(this.cfg)(`${base(this.cfg)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruct },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openai_vision_${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const [sourceText, translatedText] = splitAssist(raw);
    return {
      sourceText,
      translatedText: target ? translatedText ?? undefined : undefined,
      provider: this.id,
    };
  }
}

function splitAssist(raw: string): [string, string | undefined] {
  const parts = raw.split(/\n---\n/);
  if (parts.length >= 2) {
    return [parts[0]!.trim(), parts.slice(1).join("\n---\n").trim()];
  }
  return [raw, undefined];
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function whisperLanguage(locale: string): string {
  const baseLang = locale.split("-")[0] ?? locale;
  return baseLang === "zh" ? "zh" : baseLang;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa available in Workers / browsers; Node 20+ also has it globally in many runtimes.
  if (typeof btoa === "function") return btoa(binary);
  // Fallback for Node without btoa
  const BufferCtor = (globalThis as { Buffer?: { from: (d: Uint8Array) => { toString: (e: string) => string } } }).Buffer;
  if (BufferCtor) return BufferCtor.from(bytes).toString("base64");
  throw new Error("base64_unavailable");
}
