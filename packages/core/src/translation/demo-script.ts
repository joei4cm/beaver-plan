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
    {
      sourceText: "可以刷卡吗？",
      translatedText: "カードは使えますか？",
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
    {
      sourceText: "水を一本ください。",
      translatedText: "请给我一瓶水。",
    },
  ],
  "en|ja": [
    {
      sourceText: "How do I get to the temple?",
      translatedText: "お寺へはどうやって行きますか？",
    },
    {
      sourceText: "How much is this?",
      translatedText: "これはいくらですか？",
    },
  ],
  "ja|en": [
    {
      sourceText: "トイレはどこですか？",
      translatedText: "Where is the bathroom?",
    },
    {
      sourceText: "助けてください。",
      translatedText: "Please help me.",
    },
  ],
  "zh-CN|ko": [
    {
      sourceText: "请问地铁站怎么走？",
      translatedText: "지하철역은 어떻게 가나요?",
    },
    {
      sourceText: "这个多少钱？",
      translatedText: "이거 얼마예요?",
    },
    {
      sourceText: "我对花生过敏。",
      translatedText: "땅콩 알레르기가 있어요.",
    },
  ],
  "ko|zh-CN": [
    {
      sourceText: "화장실은 어디에 있나요?",
      translatedText: "请问洗手间在哪里？",
    },
    {
      sourceText: "물 한 병 주세요.",
      translatedText: "请给我一瓶水。",
    },
  ],
  "en|ko": [
    {
      sourceText: "How much is this?",
      translatedText: "이거 얼마예요?",
    },
    {
      sourceText: "Where is the station?",
      translatedText: "역은 어디에 있나요?",
    },
  ],
  "ko|en": [
    {
      sourceText: "감사합니다.",
      translatedText: "Thank you.",
    },
    {
      sourceText: "도움이 필요해요.",
      translatedText: "I need help.",
    },
  ],
  "zh-CN|fr": [
    {
      sourceText: "请问菜单有中文吗？",
      translatedText: "Avez-vous un menu en chinois ?",
    },
    {
      sourceText: "请问车站怎么走？",
      translatedText: "Où est la gare ?",
    },
    {
      sourceText: "请给我一瓶水。",
      translatedText: "Une bouteille d'eau, s'il vous plaît.",
    },
  ],
  "fr|zh-CN": [
    {
      sourceText: "Où sont les toilettes ?",
      translatedText: "请问洗手间在哪里？",
    },
    {
      sourceText: "Combien ça coûte ?",
      translatedText: "这个多少钱？",
    },
  ],
  "en|fr": [
    {
      sourceText: "Where is the bathroom?",
      translatedText: "Où sont les toilettes ?",
    },
    {
      sourceText: "I'd like to check in.",
      translatedText: "Je voudrais m'enregistrer.",
    },
  ],
  "fr|en": [
    {
      sourceText: "Bonjour",
      translatedText: "Hello",
    },
    {
      sourceText: "J'ai besoin d'aide",
      translatedText: "I need help",
    },
  ],
  "zh-CN|es": [
    {
      sourceText: "请问洗手间在哪里？",
      translatedText: "¿Dónde está el baño?",
    },
    {
      sourceText: "这个多少钱？",
      translatedText: "¿Cuánto cuesta esto?",
    },
  ],
  "es|zh-CN": [
    {
      sourceText: "¿Dónde está la estación?",
      translatedText: "请问车站在哪里？",
    },
    {
      sourceText: "Gracias",
      translatedText: "谢谢",
    },
  ],
  "en|es": [
    {
      sourceText: "Where is the bathroom?",
      translatedText: "¿Dónde está el baño?",
    },
    {
      sourceText: "Do you take cards?",
      translatedText: "¿Aceptan tarjeta?",
    },
  ],
  "es|en": [
    {
      sourceText: "Hola",
      translatedText: "Hello",
    },
    {
      sourceText: "Necesito ayuda",
      translatedText: "I need help",
    },
  ],
  "zh-CN|de": [
    {
      sourceText: "请问车站怎么走？",
      translatedText: "Wo ist der Bahnhof?",
    },
    {
      sourceText: "我对花生过敏。",
      translatedText: "Ich bin allergisch gegen Erdnüsse.",
    },
  ],
  "de|zh-CN": [
    {
      sourceText: "Wo ist die Toilette?",
      translatedText: "请问洗手间在哪里？",
    },
    {
      sourceText: "Was kostet das?",
      translatedText: "这个多少钱？",
    },
  ],
  "en|de": [
    {
      sourceText: "Where is the station?",
      translatedText: "Wo ist der Bahnhof?",
    },
    {
      sourceText: "Is there Wi‑Fi here?",
      translatedText: "Gibt es hier WLAN?",
    },
  ],
  "de|en": [
    {
      sourceText: "Hallo",
      translatedText: "Hello",
    },
    {
      sourceText: "Ich brauche Hilfe",
      translatedText: "I need help",
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
  "zh-CN|ja": {
    ocr: {
      sourceText: "本日定食  ¥1,200",
      translatedText: "本日の定食  ¥1,200",
    },
    caption: {
      sourceText: "门口挂着今日套餐的木牌。",
      translatedText: "入り口に今日の定食の木の看板があります。",
    },
  },
  "en|ko": {
    ocr: {
      sourceText: "OPEN 10:00–21:00",
      translatedText: "영업 10:00–21:00",
    },
    caption: {
      sourceText: "A neon street sign above a night market stall.",
      translatedText: "야시장 포장 위에 네온 간판이 보입니다.",
    },
  },
  "en|fr": {
    ocr: {
      sourceText: "FERMÉ  Lundi",
      translatedText: "FERMÉ  Lundi",
    },
    caption: {
      sourceText: "A café chalkboard with the day's specials.",
      translatedText: "Un tableau de café avec les spécialités du jour.",
    },
  },
  "en|es": {
    ocr: {
      sourceText: "ENTRADA LIBRE",
      translatedText: "ENTRADA LIBRE",
    },
    caption: {
      sourceText: "A plaza fountain under afternoon sun.",
      translatedText: "Una fuente de plaza bajo el sol de la tarde.",
    },
  },
  "en|de": {
    ocr: {
      sourceText: "EINTRITT  €8",
      translatedText: "EINTRITT  €8",
    },
    caption: {
      sourceText: "A stone arch with a ticket window beside it.",
      translatedText: "Ein steinerner Bogen mit Schalter daneben.",
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
