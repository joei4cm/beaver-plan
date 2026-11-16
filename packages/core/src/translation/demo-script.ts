import type { LanguagePair, TranslationLocale } from "./types.js";

export type DemoTurn = {
  sourceText: string;
  translatedText: string;
};

/** Scripted bilingual turns so the UI is demoable without API keys. */
const SCRIPTS: Record<string, DemoTurn[]> = {
  "zh-CN|en": [
    {
      sourceText: "请问去清水寺怎么走？",
      translatedText: "Excuse me, how do I get to Kiyomizu-dera?",
    },
    {
      sourceText: "这道菜有花生吗？我对花生过敏。",
      translatedText: "Does this dish have peanuts? I'm allergic to peanuts.",
    },
    {
      sourceText: "我们可以坐巴士去车站吗？",
      translatedText: "Can we take a bus to the station?",
    },
    {
      sourceText: "今天营业到几点？",
      translatedText: "What time do you close today?",
    },
    {
      sourceText: "请给我一瓶水，谢谢。",
      translatedText: "A bottle of water, please. Thank you.",
    },
  ],
  "en|zh-CN": [
    {
      sourceText: "Where is the nearest subway entrance?",
      translatedText: "最近的地铁口在哪里？",
    },
    {
      sourceText: "I'd like a table for two, please.",
      translatedText: "麻烦给我们一张两人桌。",
    },
    {
      sourceText: "How much is the day pass?",
      translatedText: "日票多少钱？",
    },
    {
      sourceText: "Could you take a photo for us?",
      translatedText: "能帮我们拍张照吗？",
    },
    {
      sourceText: "Is there Wi‑Fi here?",
      translatedText: "这里有无线网络吗？",
    },
  ],
  "zh-CN|ja": [
    {
      sourceText: "请问洗手间在哪里？",
      translatedText: "トイレはどこですか？",
    },
    {
      sourceText: "我想点一份拉面。",
      translatedText: "ラーメンを一つお願いします。",
    },
  ],
  "ja|zh-CN": [
    {
      sourceText: "駅までの行き方を教えてください。",
      translatedText: "请告诉我去车站怎么走。",
    },
    {
      sourceText: "このメニューのおすすめは何ですか？",
      translatedText: "这菜单里有什么推荐？",
    },
  ],
  "en|ja": [
    {
      sourceText: "How do I get to the temple?",
      translatedText: "お寺へはどうやって行きますか？",
    },
  ],
  "zh-CN|ko": [
    {
      sourceText: "请问地铁站怎么走？",
      translatedText: "지하철역은 어떻게 가나요?",
    },
  ],
  "en|ko": [
    {
      sourceText: "How much is this?",
      translatedText: "이거 얼마예요?",
    },
  ],
  "zh-CN|fr": [
    {
      sourceText: "请问菜单有中文吗？",
      translatedText: "Avez-vous un menu en chinois ?",
    },
  ],
  "en|es": [
    {
      sourceText: "Where is the bathroom?",
      translatedText: "¿Dónde está el baño?",
    },
  ],
};

const VISION_SCRIPTS: Record<
  string,
  { ocr: DemoTurn; caption: DemoTurn }
> = {
  "zh-CN|en": {
    ocr: {
      sourceText: "日替わり定食  ¥1,200\n味噌汁・サラダ付き",
      translatedText: "Daily set meal  ¥1,200\nIncludes miso soup & salad",
    },
    caption: {
      sourceText: "路边小馆的招牌午餐套餐，写着附赠味噌汤与沙拉。",
      translatedText:
        "A street-side lunch special board: set meal with miso soup and salad.",
    },
  },
  "en|zh-CN": {
    ocr: {
      sourceText: "TEMPLE HOURS  9:00–17:00\nLast entry 16:30",
      translatedText: "寺院开放时间 9:00–17:00\n最晚入场 16:30",
    },
    caption: {
      sourceText: "A wooden gate with soft lantern light at dusk.",
      translatedText: "黄昏时分，木门与柔和的灯笼光。",
    },
  },
};

function pairKey(pair: LanguagePair): string {
  return `${pair.sourceLocale}|${pair.targetLocale}`;
}

function fallbackTurns(pair: LanguagePair): DemoTurn[] {
  const a = pair.sourceLocale;
  const b = pair.targetLocale;
  return [
    {
      sourceText: `[${a}] Hello — where is the station?`,
      translatedText: `[${b}] Hello — where is the station?`,
    },
    {
      sourceText: `[${a}] One water, please.`,
      translatedText: `[${b}] One water, please.`,
    },
  ];
}

export function demoTurnsFor(pair: LanguagePair): DemoTurn[] {
  return SCRIPTS[pairKey(pair)] ?? fallbackTurns(pair);
}

export function pickDemoTurn(
  pair: LanguagePair,
  index = 0,
): DemoTurn & { index: number; total: number } {
  const turns = demoTurnsFor(pair);
  const i = ((index % turns.length) + turns.length) % turns.length;
  return { ...turns[i]!, index: i, total: turns.length };
}

/** Naive demo “translate”: look up script, else mirror with locale tags. */
export function demoTranslateText(
  text: string,
  sourceLocale: string,
  targetLocale: string,
): string {
  const key = `${sourceLocale}|${targetLocale}`;
  const turns = SCRIPTS[key];
  if (turns) {
    const hit = turns.find(
      (t) =>
        t.sourceText === text.trim() ||
        t.sourceText.includes(text.trim()) ||
        text.trim().includes(t.sourceText.slice(0, 8)),
    );
    if (hit) return hit.translatedText;
  }
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `[${targetLocale}] ${trimmed}`;
}

export function demoVisionAssist(
  pair: LanguagePair,
  mode: "ocr" | "caption",
): DemoTurn {
  const pack =
    VISION_SCRIPTS[pairKey(pair)] ??
    VISION_SCRIPTS["zh-CN|en"] ??
    VISION_SCRIPTS["en|zh-CN"]!;
  return pack[mode];
}

export function localeLabel(
  locale: TranslationLocale,
  ui: "zh-CN" | "en" = "zh-CN",
): string {
  const zh: Record<TranslationLocale, string> = {
    "zh-CN": "中文",
    en: "英语",
    ja: "日语",
    ko: "韩语",
    fr: "法语",
    es: "西班牙语",
    de: "德语",
    th: "泰语",
    vi: "越南语",
  };
  const en: Record<TranslationLocale, string> = {
    "zh-CN": "Chinese",
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    fr: "French",
    es: "Spanish",
    de: "German",
    th: "Thai",
    vi: "Vietnamese",
  };
  return ui === "en" ? en[locale] : zh[locale];
}
