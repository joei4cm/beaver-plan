import type { LanguagePair, TranslationLocale } from "./types.js";
import { isTranslationLocale, normalizePair } from "./types.js";

export type PhraseCategory =
  | "greetings"
  | "directions"
  | "food"
  | "shopping"
  | "emergency"
  | "lodging";

export type PhraseEntry = {
  id: string;
  category: PhraseCategory;
  /** Canonical key used for lookup across locales. */
  key: string;
  /** Text per locale — missing locales fall back to en then zh-CN. */
  text: Partial<Record<TranslationLocale, string>>;
};

/**
 * Cached travel phrasebook — works offline without ASR/LLM keys.
 * Practical first cut: common road phrases, not a full dictionary.
 */
export const TRAVEL_PHRASEBOOK: readonly PhraseEntry[] = [
  {
    id: "greet-hello",
    category: "greetings",
    key: "hello",
    text: {
      "zh-CN": "你好",
      en: "Hello",
      ja: "こんにちは",
      ko: "안녕하세요",
      fr: "Bonjour",
      es: "Hola",
      de: "Hallo",
      th: "สวัสดี",
      vi: "Xin chào",
    },
  },
  {
    id: "greet-thanks",
    category: "greetings",
    key: "thank_you",
    text: {
      "zh-CN": "谢谢",
      en: "Thank you",
      ja: "ありがとうございます",
      ko: "감사합니다",
      fr: "Merci",
      es: "Gracias",
      de: "Danke",
      th: "ขอบคุณ",
      vi: "Cảm ơn",
    },
  },
  {
    id: "greet-excuse",
    category: "greetings",
    key: "excuse_me",
    text: {
      "zh-CN": "请问 / 不好意思",
      en: "Excuse me",
      ja: "すみません",
      ko: "실례합니다",
      fr: "Excusez-moi",
      es: "Perdón",
      de: "Entschuldigung",
      th: "ขอโทษครับ/ค่ะ",
      vi: "Xin lỗi",
    },
  },
  {
    id: "dir-station",
    category: "directions",
    key: "where_station",
    text: {
      "zh-CN": "请问车站怎么走？",
      en: "Where is the station?",
      ja: "駅はどこですか？",
      ko: "역은 어디에 있나요?",
      fr: "Où est la gare ?",
      es: "¿Dónde está la estación?",
      de: "Wo ist der Bahnhof?",
      th: "สถานีอยู่ที่ไหน?",
      vi: "Nhà ga ở đâu?",
    },
  },
  {
    id: "dir-bathroom",
    category: "directions",
    key: "where_bathroom",
    text: {
      "zh-CN": "请问洗手间在哪里？",
      en: "Where is the bathroom?",
      ja: "トイレはどこですか？",
      ko: "화장실은 어디에 있나요?",
      fr: "Où sont les toilettes ?",
      es: "¿Dónde está el baño?",
      de: "Wo ist die Toilette?",
      th: "ห้องน้ำอยู่ที่ไหน?",
      vi: "Nhà vệ sinh ở đâu?",
    },
  },
  {
    id: "dir-this",
    category: "directions",
    key: "how_to_get_here",
    text: {
      "zh-CN": "请问怎么去这里？",
      en: "How do I get here?",
      ja: "ここへはどうやって行きますか？",
      ko: "여기 어떻게 가나요?",
      fr: "Comment puis-je y aller ?",
      es: "¿Cómo llego aquí?",
      de: "Wie komme ich hierhin?",
      th: "ไปที่นี่อย่างไร?",
      vi: "Làm sao đến đây?",
    },
  },
  {
    id: "food-menu",
    category: "food",
    key: "menu_please",
    text: {
      "zh-CN": "请给我菜单",
      en: "The menu, please",
      ja: "メニューをお願いします",
      ko: "메뉴 주세요",
      fr: "La carte, s'il vous plaît",
      es: "La carta, por favor",
      de: "Die Speisekarte, bitte",
      th: "ขอเมนูหน่อย",
      vi: "Cho tôi xem thực đơn",
    },
  },
  {
    id: "food-water",
    category: "food",
    key: "water_please",
    text: {
      "zh-CN": "请给我一瓶水",
      en: "A bottle of water, please",
      ja: "水を一本ください",
      ko: "물 한 병 주세요",
      fr: "Une bouteille d'eau, s'il vous plaît",
      es: "Una botella de agua, por favor",
      de: "Eine Flasche Wasser, bitte",
      th: "ขอน้ำหนึ่งขวด",
      vi: "Cho tôi một chai nước",
    },
  },
  {
    id: "food-allergy",
    category: "food",
    key: "peanut_allergy",
    text: {
      "zh-CN": "我对花生过敏",
      en: "I'm allergic to peanuts",
      ja: "ピーナッツアレルギーがあります",
      ko: "땅콩 알레르기가 있어요",
      fr: "Je suis allergique aux arachides",
      es: "Soy alérgico/a al cacahuete",
      de: "Ich bin allergisch gegen Erdnüsse",
      th: "ฉันแพ้ถั่วลิสง",
      vi: "Tôi dị ứng đậu phộng",
    },
  },
  {
    id: "shop-how-much",
    category: "shopping",
    key: "how_much",
    text: {
      "zh-CN": "这个多少钱？",
      en: "How much is this?",
      ja: "これはいくらですか？",
      ko: "이거 얼마예요?",
      fr: "Combien ça coûte ?",
      es: "¿Cuánto cuesta esto?",
      de: "Was kostet das?",
      th: "อันนี้เท่าไหร่?",
      vi: "Cái này bao nhiêu tiền?",
    },
  },
  {
    id: "shop-card",
    category: "shopping",
    key: "card_ok",
    text: {
      "zh-CN": "可以刷卡吗？",
      en: "Do you take cards?",
      ja: "カードは使えますか？",
      ko: "카드 되나요?",
      fr: "Acceptez-vous les cartes ?",
      es: "¿Aceptan tarjeta?",
      de: "Kann ich mit Karte zahlen?",
      th: "รับบัตรไหม?",
      vi: "Có nhận thẻ không?",
    },
  },
  {
    id: "emerg-help",
    category: "emergency",
    key: "need_help",
    text: {
      "zh-CN": "请帮帮我",
      en: "I need help",
      ja: "助けてください",
      ko: "도움이 필요해요",
      fr: "J'ai besoin d'aide",
      es: "Necesito ayuda",
      de: "Ich brauche Hilfe",
      th: "ฉันต้องการความช่วยเหลือ",
      vi: "Tôi cần giúp đỡ",
    },
  },
  {
    id: "emerg-doctor",
    category: "emergency",
    key: "need_doctor",
    text: {
      "zh-CN": "我需要看医生",
      en: "I need a doctor",
      ja: "医者が必要です",
      ko: "의사가 필요해요",
      fr: "J'ai besoin d'un médecin",
      es: "Necesito un médico",
      de: "Ich brauche einen Arzt",
      th: "ฉันต้องการหมอ",
      vi: "Tôi cần bác sĩ",
    },
  },
  {
    id: "lodge-checkin",
    category: "lodging",
    key: "check_in",
    text: {
      "zh-CN": "我要办理入住",
      en: "I'd like to check in",
      ja: "チェックインをお願いします",
      ko: "체크인하고 싶어요",
      fr: "Je voudrais m'enregistrer",
      es: "Quiero hacer el check-in",
      de: "Ich möchte einchecken",
      th: "ต้องการเช็คอิน",
      vi: "Tôi muốn nhận phòng",
    },
  },
  {
    id: "lodge-wifi",
    category: "lodging",
    key: "wifi",
    text: {
      "zh-CN": "这里有无线网络吗？",
      en: "Is there Wi‑Fi here?",
      ja: "Wi‑Fiはありますか？",
      ko: "여기 Wi‑Fi 있나요?",
      fr: "Y a-t-il du Wi‑Fi ici ?",
      es: "¿Hay Wi‑Fi aquí?",
      de: "Gibt es hier WLAN?",
      th: "มี Wi‑Fi ที่นี่ไหม?",
      vi: "Ở đây có Wi‑Fi không?",
    },
  },
] as const;

export type PhrasebookLookup = {
  id: string;
  category: PhraseCategory;
  key: string;
  sourceText: string;
  translatedText: string;
  pair: LanguagePair;
};

function pickText(
  entry: PhraseEntry,
  locale: TranslationLocale,
): string | undefined {
  return (
    entry.text[locale] ??
    entry.text.en ??
    entry.text["zh-CN"] ??
    Object.values(entry.text)[0]
  );
}

/** Resolve a phrase for a language pair (cached / offline-safe). */
export function lookupPhrase(
  entry: PhraseEntry,
  sourceLocale: string,
  targetLocale: string,
): PhrasebookLookup {
  const pair = normalizePair(sourceLocale, targetLocale);
  const sourceText = pickText(entry, pair.sourceLocale) ?? entry.key;
  const translatedText = pickText(entry, pair.targetLocale) ?? sourceText;
  return {
    id: entry.id,
    category: entry.category,
    key: entry.key,
    sourceText,
    translatedText,
    pair,
  };
}

export function listPhrasebook(
  sourceLocale?: string,
  targetLocale?: string,
  category?: PhraseCategory,
): PhrasebookLookup[] {
  const pair = normalizePair(sourceLocale, targetLocale);
  return TRAVEL_PHRASEBOOK.filter((e) =>
    category ? e.category === category : true,
  ).map((e) => lookupPhrase(e, pair.sourceLocale, pair.targetLocale));
}

export function findPhraseById(
  id: string,
  sourceLocale?: string,
  targetLocale?: string,
): PhrasebookLookup | null {
  const entry = TRAVEL_PHRASEBOOK.find((e) => e.id === id);
  if (!entry) return null;
  return lookupPhrase(entry, sourceLocale ?? "zh-CN", targetLocale ?? "en");
}

/** Offline stub translate: phrasebook hit, else null (caller may queue). */
export function offlinePhraseTranslate(
  text: string,
  sourceLocale: string,
  targetLocale: string,
): PhrasebookLookup | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const pair = normalizePair(sourceLocale, targetLocale);
  const src = isTranslationLocale(pair.sourceLocale)
    ? pair.sourceLocale
    : "zh-CN";
  for (const entry of TRAVEL_PHRASEBOOK) {
    const candidate = pickText(entry, src);
    if (!candidate) continue;
    if (
      candidate === trimmed ||
      candidate.includes(trimmed) ||
      trimmed.includes(candidate.slice(0, Math.min(8, candidate.length)))
    ) {
      return lookupPhrase(entry, pair.sourceLocale, pair.targetLocale);
    }
  }
  return null;
}

export const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
  "greetings",
  "directions",
  "food",
  "shopping",
  "emergency",
  "lodging",
] as const;
