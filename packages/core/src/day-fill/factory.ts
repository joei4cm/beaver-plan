import type { OpenAiCompatConfig } from "../translation/openai.js";
import { DemoDayFillProvider } from "./demo.js";
import { OpenAiDayFillProvider } from "./openai.js";
import type { DayFillStack } from "./types.js";

export type DayFillKeyBag = {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiChatModel?: string;
  /** openai | demo | auto — default auto */
  llmProvider?: string;
  fetch?: typeof fetch;
};

function openaiCfg(keys: DayFillKeyBag): OpenAiCompatConfig | null {
  if (!keys.openaiApiKey) return null;
  return {
    apiKey: keys.openaiApiKey,
    baseUrl: keys.openaiBaseUrl,
    chatModel: keys.openaiChatModel,
    fetch: keys.fetch,
  };
}

/**
 * Build day-fill stack. Missing OpenAI key (or LLM_PROVIDER=demo) → scripted demo.
 */
export function createDayFillStack(keys: DayFillKeyBag): DayFillStack {
  const pref = (keys.llmProvider ?? "auto").toLowerCase();
  const openai = openaiCfg(keys);

  if (pref === "demo" || !openai) {
    return { provider: new DemoDayFillProvider(), mode: "demo" };
  }
  return { provider: new OpenAiDayFillProvider(openai), mode: "live" };
}

export function reportDayFillCapabilities(stack: DayFillStack): {
  mode: "live" | "demo";
  provider: string;
} {
  return {
    mode: stack.mode,
    provider: stack.provider.id,
  };
}
