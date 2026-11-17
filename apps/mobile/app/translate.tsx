import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Audio } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import * as Speech from "expo-speech";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  PRIMARY_TRANSLATION_LOCALES,
  TRANSLATION_LOCALES,
  enqueueTranslation,
  listPhrasebook,
  listQueuedTranslations,
  localeLabel,
  offlinePhraseTranslate,
  pendingQueueCount,
  swapPair,
  type PhraseCategory,
  type PhrasebookLookup,
  type QueuedTranslation,
  type TranslationLocale,
} from "@beaver/core";
import { colors } from "@beaver/ui-tokens";
import { t, type MessageKey } from "@beaver/i18n";
import {
  fetchPhrasebook,
  fetchTranslationStatus,
  runPartialAsr,
  runTranslationTurn,
  runVisionAssist,
  type LiveTurnResponse,
  type TranslationStatus,
} from "../src/api";
import { createMobileOfflineQueueStore } from "../src/offline/translation-queue";

const uiLocale = "zh-CN" as const;

type Tab = "conversation" | "camera";
type Facing = "front" | "back";

type TurnRow = {
  id: string;
  sourceText: string;
  translatedText: string;
  mode: "live" | "demo" | "offline";
};

const CATEGORY_KEYS: PhraseCategory[] = [
  "greetings",
  "directions",
  "food",
  "shopping",
  "emergency",
  "lodging",
];

export default function TranslateScreen() {
  const [tab, setTab] = useState<Tab>("conversation");
  const [sourceLocale, setSourceLocale] = useState<TranslationLocale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<TranslationLocale>("en");
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoIndex, setDemoIndex] = useState(0);
  const [facing, setFacing] = useState<Facing>("back");
  const [overlay, setOverlay] = useState<{
    source: string;
    translated: string;
  } | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const queueStore = useMemo(() => createMobileOfflineQueueStore(), []);
  const [partialText, setPartialText] = useState("");
  const [phrases, setPhrases] = useState<PhrasebookLookup[]>([]);
  const [phraseCategory, setPhraseCategory] =
    useState<PhraseCategory>("greetings");
  const [queue, setQueue] = useState<QueuedTranslation[]>([]);
  const partialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sequenceRef = useRef(0);

  const refreshQueue = useCallback(async () => {
    setQueue(await listQueuedTranslations(queueStore));
  }, [queueStore]);

  useEffect(() => {
    void fetchTranslationStatus()
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
          primaryLocales: [...PRIMARY_TRANSLATION_LOCALES],
          streamingMode: "chunked",
          offlineAssist: "phrasebook",
        }),
      );
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    void fetchPhrasebook({
      sourceLocale,
      targetLocale,
      category: phraseCategory,
    })
      .then((rows) =>
        setPhrases(
          rows.map((r) => ({
            id: r.id,
            category: r.category as PhraseCategory,
            key: r.key,
            sourceText: r.sourceText,
            translatedText: r.translatedText,
            pair: { sourceLocale, targetLocale },
          })),
        ),
      )
      .catch(() =>
        setPhrases(listPhrasebook(sourceLocale, targetLocale, phraseCategory)),
      );
  }, [sourceLocale, targetLocale, phraseCategory]);

  const speakTranslation = useCallback(
    async (text: string, locale: string, audio?: LiveTurnResponse["tts"]) => {
      if (!text) return;
      if (audio?.audioBase64 && !audio.speakLocally) {
        try {
          const uri = `${FileSystem.cacheDirectory}bp-tts-${Date.now()}.mp3`;
          await FileSystem.writeAsStringAsync(uri, audio.audioBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const { sound } = await Audio.Sound.createAsync({ uri });
          await sound.playAsync();
          sound.setOnPlaybackStatusUpdate((s) => {
            if (s.isLoaded && s.didJustFinish) void sound.unloadAsync();
          });
          return;
        } catch {
          /* fall through to device speech */
        }
      }
      Speech.stop();
      Speech.speak(text, {
        language: locale.startsWith("zh") ? "zh-CN" : locale,
        rate: 0.96,
      });
    },
    [],
  );

  const pushTurn = useCallback((res: LiveTurnResponse) => {
    if (!res.sourceText && !res.translatedText) return;
    setTurns((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sourceText: res.sourceText,
        translatedText: res.translatedText,
        mode: res.mode,
      },
      ...prev,
    ]);
    setDemoIndex((i) => i + 1);
  }, []);

  async function runTurn(input: {
    text?: string;
    audioBase64?: string;
    mimeType?: string;
  }) {
    setBusy(true);
    setError(null);
    setPartialText("");
    try {
      const res = await runTranslationTurn({
        ...input,
        sourceLocale,
        targetLocale,
        withTts: true,
        demoTurnIndex: demoIndex,
      });
      pushTurn(res);
      await speakTranslation(res.translatedText, targetLocale, res.tts);
    } catch {
      const text = input.text?.trim();
      if (text) {
        const hit = offlinePhraseTranslate(text, sourceLocale, targetLocale);
        if (hit) {
          pushTurn({
            sourceText: hit.sourceText,
            translatedText: hit.translatedText,
            pair: hit.pair,
            asrProvider: "phrasebook",
            translateProvider: "phrasebook",
            mode: "demo",
            tts: null,
          });
          setTurns((prev) =>
            prev.map((row, i) =>
              i === 0 ? { ...row, mode: "offline" } : row,
            ),
          );
          await speakTranslation(hit.translatedText, targetLocale);
        } else {
          const item = await enqueueTranslation(queueStore, {
            text,
            sourceLocale,
            targetLocale,
          });
          pushTurn({
            sourceText: item.text,
            translatedText:
              item.offlineHint?.translatedText ??
              `[${targetLocale}] ${item.text}`,
            pair: item.pair,
            asrProvider: "offline-queue",
            translateProvider: "offline-queue",
            mode: "demo",
            tts: null,
          });
          setTurns((prev) =>
            prev.map((row, i) =>
              i === 0 ? { ...row, mode: "offline" } : row,
            ),
          );
          await refreshQueue();
        }
      } else {
        setError(t(uiLocale, "translate.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function startListening() {
    setError(null);
    setPartialText("");
    sequenceRef.current = 0;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError(t(uiLocale, "translate.permissionMic"));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setListening(true);
      // Optimistic partials: demo/live chunked ASR without waiting for release
      if (partialTimerRef.current) clearInterval(partialTimerRef.current);
      partialTimerRef.current = setInterval(() => {
        const seq = sequenceRef.current++;
        void runPartialAsr({
          locale: sourceLocale,
          targetLocale,
          sequence: seq,
          demoTurnIndex: demoIndex,
        })
          .then((p) => {
            if (p.text) setPartialText(p.text);
          })
          .catch(() => {
            /* ignore */
          });
      }, 900);
    } catch {
      setError(t(uiLocale, "translate.permissionMic"));
    }
  }

  async function stopListening() {
    if (partialTimerRef.current) {
      clearInterval(partialTimerRef.current);
      partialTimerRef.current = null;
    }
    const recording = recordingRef.current;
    recordingRef.current = null;
    setListening(false);
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) {
        // Demo path without usable audio file
        await runTurn({});
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await runTurn({
        audioBase64: base64,
        mimeType: "audio/m4a",
      });
    } catch {
      // Still advance a demo turn so the UX stays demoable
      await runTurn({});
    }
  }

  async function onSendText() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await runTurn({ text });
  }

  async function onVision(mode: "ocr" | "caption") {
    setBusy(true);
    setError(null);
    try {
      if (!camPermission?.granted) {
        const next = await requestCamPermission();
        if (!next.granted) {
          setError(t(uiLocale, "translate.permissionCamera"));
          return;
        }
      }
      let imageBase64: string | undefined;
      let mimeType = "image/jpeg";
      try {
        const shot = await cameraRef.current?.takePictureAsync({
          base64: true,
          quality: 0.55,
          skipProcessing: true,
        });
        if (shot?.base64) {
          imageBase64 = shot.base64;
          mimeType = "image/jpeg";
        }
      } catch {
        /* demo vision works without a frame */
      }
      const res = await runVisionAssist({
        imageBase64,
        mimeType,
        mode,
        sourceLocale,
        targetLocale,
      });
      setOverlay({
        source: res.sourceText,
        translated: res.translatedText ?? "",
      });
      pushTurn({
        sourceText: res.sourceText,
        translatedText: res.translatedText ?? "",
        pair: res.pair,
        asrProvider: "vision",
        translateProvider: res.provider,
        mode: res.mode,
        tts: null,
      });
      if (res.translatedText) {
        await speakTranslation(res.translatedText, targetLocale);
      }
    } catch {
      setError(t(uiLocale, "translate.error"));
    } finally {
      setBusy(false);
    }
  }

  function onSwap() {
    const next = swapPair({ sourceLocale, targetLocale });
    setSourceLocale(next.sourceLocale);
    setTargetLocale(next.targetLocale);
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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: t(uiLocale, "translate.title") }} />

      <View style={styles.hero}>
        <Text style={styles.brandLine}>Beaver Plan · 海狸旅行</Text>
        <Text style={styles.eyebrow}>{t(uiLocale, "translate.eyebrow")}</Text>
        <Text style={styles.title}>{t(uiLocale, "mobile.translate")}</Text>
        <Text style={styles.support}>{t(uiLocale, "translate.support")}</Text>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              status?.mode === "live" ? styles.badgeLive : styles.badgeDemo,
            ]}
          >
            <Text style={styles.badgeText}>
              {status?.mode === "live"
                ? t(uiLocale, "translate.liveBadge")
                : t(uiLocale, "translate.demoBadge")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab("conversation")}
          style={[styles.tab, tab === "conversation" && styles.tabActive]}
        >
          <Text
            style={[
              styles.tabLabel,
              tab === "conversation" && styles.tabLabelActive,
            ]}
          >
            {t(uiLocale, "translate.mode.conversation")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("camera")}
          style={[styles.tab, tab === "camera" && styles.tabActive]}
        >
          <Text
            style={[styles.tabLabel, tab === "camera" && styles.tabLabelActive]}
          >
            {t(uiLocale, "translate.mode.camera")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.pairRow}>
        <LocalePicker
          label={t(uiLocale, "translate.source")}
          value={sourceLocale}
          locales={orderedLocales}
          onChange={setSourceLocale}
        />
        <Pressable onPress={onSwap} style={styles.swapBtn}>
          <Text style={styles.swapLabel}>⇄</Text>
        </Pressable>
        <LocalePicker
          label={t(uiLocale, "translate.target")}
          value={targetLocale}
          locales={orderedLocales}
          onChange={setTargetLocale}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tab === "conversation" ? (
        <View style={styles.panel}>
          <ScrollView
            style={styles.transcript}
            contentContainerStyle={styles.transcriptContent}
          >
            {turns.length === 0 && (
              <Text style={styles.empty}>{t(uiLocale, "translate.empty")}</Text>
            )}
            {turns.map((row) => (
              <View key={row.id} style={styles.bubble}>
                <Text style={styles.bubbleSource}>{row.sourceText}</Text>
                <Text style={styles.bubbleTarget}>{row.translatedText}</Text>
              </View>
            ))}
          </ScrollView>

          {(listening || partialText) ? (
            <Text style={styles.partial}>
              {t(uiLocale, "translate.partialHint")} {partialText || "…"}
            </Text>
          ) : null}

          <View style={styles.phraseHead}>
            <Text style={styles.phraseTitle}>
              {t(uiLocale, "translate.phrasebook")}
            </Text>
            <Text style={styles.phraseHint}>
              {t(uiLocale, "translate.phrasebookHint")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {CATEGORY_KEYS.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setPhraseCategory(cat)}
                  style={[
                    styles.catChip,
                    phraseCategory === cat && styles.catChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      phraseCategory === cat && styles.catChipTextActive,
                    ]}
                  >
                    {t(uiLocale, `translate.category.${cat}` as MessageKey)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {phrases.slice(0, 6).map((phrase) => (
              <Pressable
                key={phrase.id}
                style={styles.phraseRow}
                onPress={() => {
                  pushTurn({
                    sourceText: phrase.sourceText,
                    translatedText: phrase.translatedText,
                    pair: phrase.pair,
                    asrProvider: "phrasebook",
                    translateProvider: "phrasebook",
                    mode: "demo",
                    tts: null,
                  });
                  void speakTranslation(phrase.translatedText, targetLocale);
                }}
              >
                <Text style={styles.bubbleSource}>{phrase.sourceText}</Text>
                <Text style={styles.bubbleTarget}>{phrase.translatedText}</Text>
              </Pressable>
            ))}
            {pendingQueueCount(queue) > 0 ? (
              <Text style={styles.queueNote}>
                {t(uiLocale, "offline.pending").replace(
                  "{n}",
                  String(pendingQueueCount(queue)),
                )}
              </Text>
            ) : null}
          </View>

          <View style={styles.compose}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t(uiLocale, "translate.typeHint")}
              placeholderTextColor="rgba(42,58,52,0.45)"
              style={styles.input}
              editable={!busy}
              onSubmitEditing={() => void onSendText()}
              returnKeyType="send"
            />
            <Pressable
              style={[styles.sendBtn, busy && styles.disabled]}
              onPress={() => void onSendText()}
              disabled={busy}
            >
              <Text style={styles.sendLabel}>{t(uiLocale, "translate.send")}</Text>
            </Pressable>
          </View>

          <View style={styles.micRow}>
            <Pressable
              onPressIn={() => void startListening()}
              onPressOut={() => void stopListening()}
              style={[
                styles.micBtn,
                listening && styles.micBtnActive,
                busy && styles.disabled,
              ]}
              disabled={busy && !listening}
            >
              {busy && !listening ? (
                <ActivityIndicator color={colors.foam} />
              ) : (
                <Text style={styles.micLabel}>
                  {listening
                    ? t(uiLocale, "translate.listening")
                    : t(uiLocale, "translate.holdMic")}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.demoNext}
              onPress={() => void runTurn({})}
              disabled={busy}
            >
              <Text style={styles.demoNextLabel}>
                {t(uiLocale, "translate.nextDemo")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.cameraPanel}>
          <View style={styles.cameraFrame}>
            {camPermission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
              />
            ) : (
              <View style={styles.cameraFallback}>
                <Text style={styles.cameraFallbackText}>
                  {t(uiLocale, "translate.cameraHint")}
                </Text>
                <Pressable
                  style={styles.sendBtn}
                  onPress={() => void requestCamPermission()}
                >
                  <Text style={styles.sendLabel}>
                    {t(uiLocale, "translate.permissionCamera")}
                  </Text>
                </Pressable>
              </View>
            )}
            {overlay ? (
              <View style={styles.subtitle}>
                <Text style={styles.subtitleSource}>{overlay.source}</Text>
                {overlay.translated ? (
                  <Text style={styles.subtitleTarget}>{overlay.translated}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.cameraActions}>
            <Pressable
              style={styles.facingBtn}
              onPress={() =>
                setFacing((f) => (f === "back" ? "front" : "back"))
              }
            >
              <Text style={styles.facingLabel}>
                {facing === "back"
                  ? t(uiLocale, "translate.cameraBack")
                  : t(uiLocale, "translate.cameraFront")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.visionBtn, busy && styles.disabled]}
              onPress={() => void onVision("ocr")}
              disabled={busy}
            >
              <Text style={styles.visionLabel}>{t(uiLocale, "translate.ocr")}</Text>
            </Pressable>
            <Pressable
              style={[styles.visionBtnAlt, busy && styles.disabled]}
              onPress={() => void onVision("caption")}
              disabled={busy}
            >
              <Text style={styles.visionLabelAlt}>
                {t(uiLocale, "translate.caption")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function LocalePicker({
  label,
  value,
  locales,
  onChange,
}: {
  label: string;
  value: TranslationLocale;
  locales: TranslationLocale[];
  onChange: (v: TranslationLocale) => void;
}) {
  return (
    <View style={styles.localeCol}>
      <Text style={styles.localeLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.localeChips}
      >
        {locales.map((loc) => (
          <Pressable
            key={loc}
            onPress={() => onChange(loc)}
            style={[styles.localeChip, value === loc && styles.localeChipActive]}
          >
            <Text
              style={[
                styles.localeChipText,
                value === loc && styles.localeChipTextActive,
              ]}
            >
              {localeLabel(loc, uiLocale)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: colors.ink,
  },
  brandLine: {
    color: "rgba(250,251,252,0.55)",
    letterSpacing: 2.8,
    textTransform: "uppercase",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 8,
  },
  eyebrow: {
    color: "rgba(250,251,252,0.62)",
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    marginTop: 6,
    color: colors.foam,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  support: {
    marginTop: 8,
    color: "rgba(250,251,252,0.78)",
    fontSize: 14,
    lineHeight: 20,
  },
  badgeRow: { marginTop: 12, flexDirection: "row" },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDemo: { backgroundColor: "rgba(232,78,47,0.4)" },
  badgeLive: { backgroundColor: "rgba(25,168,161,0.45)" },
  badgeText: { color: colors.foam, fontSize: 11, fontWeight: "700" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  tabLabel: { color: colors.inkSoft, fontWeight: "600", fontSize: 14 },
  tabLabelActive: { color: colors.foam },
  pairRow: {
    marginTop: 12,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  localeCol: { flex: 1 },
  localeLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 6,
  },
  localeChips: { gap: 6 },
  localeChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  localeChipActive: {
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  localeChipText: { fontSize: 12, color: colors.inkSoft },
  localeChipTextActive: { color: colors.foam, fontWeight: "600" },
  swapBtn: {
    marginTop: 22,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mist,
    alignItems: "center",
    justifyContent: "center",
  },
  swapLabel: { fontSize: 16, color: colors.riverDeep },
  error: {
    marginHorizontal: 20,
    marginTop: 8,
    color: colors.timber,
    fontSize: 13,
  },
  panel: { flex: 1, marginTop: 8 },
  transcript: { flex: 1 },
  transcriptContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  empty: {
    marginTop: 24,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  bubble: {
    borderRadius: 14,
    backgroundColor: colors.foam,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  bubbleSource: { color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  bubbleTarget: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 24,
  },
  compose: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
  },
  sendBtn: {
    borderRadius: 10,
    backgroundColor: colors.river,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  sendLabel: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  micRow: {
    padding: 16,
    gap: 10,
  },
  micBtn: {
    borderRadius: 14,
    backgroundColor: colors.riverDeep,
    paddingVertical: 18,
    alignItems: "center",
  },
  micBtnActive: { backgroundColor: colors.timber },
  micLabel: { color: colors.foam, fontSize: 16, fontWeight: "600" },
  demoNext: {
    alignItems: "center",
    paddingVertical: 8,
  },
  demoNextLabel: { color: colors.river, fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.55 },
  cameraPanel: { flex: 1, marginTop: 8, paddingHorizontal: 16, paddingBottom: 16 },
  cameraFrame: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.riverDeep,
    minHeight: 280,
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 14,
  },
  cameraFallbackText: {
    color: "rgba(247,250,248,0.85)",
    textAlign: "center",
    lineHeight: 20,
  },
  subtitle: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 12,
    backgroundColor: "rgba(15,67,57,0.78)",
    padding: 12,
    gap: 4,
  },
  subtitleSource: {
    color: "rgba(247,250,248,0.75)",
    fontSize: 12,
    lineHeight: 16,
  },
  subtitleTarget: {
    color: colors.foam,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  cameraActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  facingBtn: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  facingLabel: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  visionBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.river,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  visionBtnAlt: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.riverDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  visionLabel: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  visionLabelAlt: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  partial: {
    marginHorizontal: 16,
    marginBottom: 8,
    color: colors.riverDeep,
    fontSize: 13,
  },
  phraseHead: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  phraseTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  phraseHint: { color: colors.inkSoft, fontSize: 12, lineHeight: 16 },
  catChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  catChipActive: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  catChipText: { fontSize: 12, color: colors.inkSoft },
  catChipTextActive: { color: colors.foam, fontWeight: "600" },
  phraseRow: {
    borderRadius: 10,
    backgroundColor: colors.foam,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 10,
    gap: 4,
  },
  queueNote: { color: colors.timber, fontSize: 12 },
});
