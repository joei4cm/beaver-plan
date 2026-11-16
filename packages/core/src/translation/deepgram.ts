import type { AsrProvider } from "./ports.js";
import type { AsrRequest, AsrResult } from "./types.js";

export type DeepgramConfig = {
  apiKey: string;
  /** Default nova-2 */
  model?: string;
  fetch?: typeof fetch;
};

/** Deepgram pre-recorded transcription. */
export class DeepgramAsrProvider implements AsrProvider {
  readonly id = "deepgram";

  constructor(private readonly cfg: DeepgramConfig) {}

  async transcribe(req: AsrRequest): Promise<AsrResult> {
    const model = this.cfg.model ?? "nova-2";
    const lang = req.locale ? deepgramLanguage(req.locale) : "en";
    const url = new URL("https://api.deepgram.com/v1/listen");
    url.searchParams.set("model", model);
    url.searchParams.set("language", lang);
    url.searchParams.set("smart_format", "true");

    const fetchFn = this.cfg.fetch ?? fetch;
    const ab = req.audio.buffer.slice(
      req.audio.byteOffset,
      req.audio.byteOffset + req.audio.byteLength,
    ) as ArrayBuffer;
    const res = await fetchFn(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${this.cfg.apiKey}`,
        "Content-Type": req.mimeType || "audio/webm",
      },
      body: ab,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`deepgram_asr_${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: string; confidence?: number }>;
        }>;
      };
    };
    const alt = json.results?.channels?.[0]?.alternatives?.[0];
    return {
      text: (alt?.transcript ?? "").trim(),
      provider: this.id,
      confidence: alt?.confidence,
    };
  }
}

function deepgramLanguage(locale: string): string {
  if (locale.startsWith("zh")) return "zh";
  return locale.split("-")[0] ?? "en";
}
