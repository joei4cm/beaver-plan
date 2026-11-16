import type {
  AsrProvider,
  TtsProvider,
  TranslationProvider,
  VisionAssistProvider,
} from "./ports.js";
import {
  demoTranslateText,
  demoVisionAssist,
  pickDemoTurn,
} from "./demo-script.js";
import { normalizePair, type AsrRequest, type AsrResult } from "./types.js";
import type {
  TtsRequest,
  TtsResult,
  TranslationRequest,
  TranslationResult,
  VisionAssistRequest,
  VisionAssistResult,
} from "./types.js";

export class DemoTranslationProvider implements TranslationProvider {
  readonly id = "demo-llm";

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    return {
      text: demoTranslateText(
        req.text,
        req.sourceLocale,
        req.targetLocale,
      ),
      provider: this.id,
    };
  }
}

export class DemoAsrProvider implements AsrProvider {
  readonly id = "demo-asr";
  private turn = 0;

  /** Optional: advance scripted mic turns when audio has no text cue. */
  nextDemoIndex(): number {
    const i = this.turn;
    this.turn += 1;
    return i;
  }

  async transcribe(req: AsrRequest & { demoTurnIndex?: number }): Promise<AsrResult> {
    const pair = normalizePair("zh-CN", "en");
    const turn = pickDemoTurn(
      pair,
      req.demoTurnIndex ?? this.nextDemoIndex(),
    );
    return {
      text: turn.sourceText,
      provider: this.id,
      confidence: 0.92,
    };
  }
}

export class DemoTtsProvider implements TtsProvider {
  readonly id = "demo-tts";

  async synthesize(_req: TtsRequest): Promise<TtsResult> {
    return {
      audio: null,
      mimeType: "audio/wav",
      provider: this.id,
      speakLocally: true,
    };
  }
}

export class DemoVisionAssistProvider implements VisionAssistProvider {
  readonly id = "demo-vision";

  async assist(req: VisionAssistRequest): Promise<VisionAssistResult> {
    const pair = normalizePair(req.sourceLocale, req.targetLocale);
    const demo = demoVisionAssist(pair, req.mode);
    return {
      sourceText: demo.sourceText,
      translatedText: demo.translatedText,
      provider: this.id,
    };
  }
}
