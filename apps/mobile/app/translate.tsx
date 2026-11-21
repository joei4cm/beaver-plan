import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
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
  demoTurnsFor,
  demoVisionAssist,
  enqueueTranslation,
  listPhrasebook,
  listQueuedTranslations,
  localeLabel,
  offlinePhraseTranslate,
  pendingQueueCount,
  pickDemoTurn,
  swapPair,
  type PhraseCategory,
  type PhrasebookLookup,
  type QueuedTranslation,
  type TranslationLocale,
} from "@beaver/core";
import { brand, colors, motion, radius } from "@beaver/ui-tokens";
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
import { SheetPresence } from "../src/components/sheet-presence";
import { SoftFailNotice } from "../src/components/soft-fail-notice";
import { isDeviceOnline } from "../src/offline/trip-offline";
import { createMobileOfflineQueueStore } from "../src/offline/translation-queue";
import { type } from "../src/theme";

/** Tip 011 — shared #46 rise easing (match Expo settings / trips). */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

const uiLocale = "zh-CN" as const;

/** Soft-fail transport noise — never surface timber / Failed to fetch. */
function isNoiseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /_503$|_502$|_504$|Failed to fetch|Network request failed|load_failed|ECONNREFUSED|TypeError/i.test(
    msg,
  );
}

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

function softDemoStatus(): TranslationStatus {
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
): TurnRow[] {
  return demoTurnsFor({ sourceLocale, targetLocale })
    .slice(0, 2)
    .map((row, i) => ({
      id: `seed-${i}-${row.sourceText.slice(0, 8)}`,
      sourceText: row.sourceText,
      translatedText: row.translatedText,
      mode: "demo" as const,
    }));
}

export default function TranslateScreen() {
  const [tab, setTab] = useState<Tab>("conversation");
  const [sourceLocale, setSourceLocale] = useState<TranslationLocale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<TranslationLocale>("en");
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [softNotice, setSoftNotice] = useState(true);
  const [online, setOnline] = useState(isDeviceOnline);
  /** Empty first paint — empty SoftFail owns history chrome (BEA-229). */
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const [facing, setFacing] = useState<Facing>("back");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [overlay, setOverlay] = useState<{
    source: string;
    translated: string;
  } | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const draftRef = useRef<TextInput>(null);
  const micRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const queueStore = useMemo(() => createMobileOfflineQueueStore(), []);
  const [partialText, setPartialText] = useState("");
  const [phrases, setPhrases] = useState<PhrasebookLookup[]>([]);
  const [phraseCategory, setPhraseCategory] =
    useState<PhraseCategory>("greetings");
  const [queue, setQueue] = useState<QueuedTranslation[]>([]);
  const partialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sequenceRef = useRef(0);
  const seededPairRef = useRef("zh-CN|en");
  const historyRise = useRef(new Animated.Value(0)).current;
  const holdListen = useRef(new Animated.Value(0)).current;
  const reduceMotionRef = useRef(false);

  const isDemo = !status || status.mode === "demo" || softNotice;

  const camDenied = Boolean(camPermission && !camPermission.granted);

  /**
   * Expo Talk empty SoftFailNotice chrome (BEA-229 after #171 planner empty):
   * empty history owns compact SoftFail under azure history rail ·
   * SheetPresence body · tip-011 (#46) · StyleSheet.flatten.
   * Talk SoftFail yields while empty owns soft-fail (no double depth).
   * Soft copy never timber / Failed to fetch.
   */
  const historyEmpty = turns.length === 0;
  const emptyOwnsSoft = tab === "conversation" && historyEmpty;
  const emptySoftOpen =
    emptyOwnsSoft && (isDemo || micDenied || Boolean(error) || softNotice);
  const emptySoftCopy = micDenied
    ? t(uiLocale, "translate.permissionMic")
    : softNotice && !online
      ? t(uiLocale, "translate.softOffline")
      : isDemo || (error && isNoiseError(new Error(error)))
        ? t(uiLocale, "translate.emptySoftFail")
        : error
          ? t(uiLocale, "translate.error")
          : t(uiLocale, "translate.emptySoftFail");

  /**
   * Expo Talk SoftFailNotice depth beyond empty (BEA-266 after #150 / #178):
   * foam talk rail · azure head · talkSupport · mist soft badge ·
   * compact SoftFailNotice · tip-011 SheetPresence body · StyleSheet.flatten.
   * Soft-fail never timber / Failed to fetch.
   * Yields while empty history owns soft-fail (no double depth).
   */
  const talkSoftOpen =
    tab === "conversation" &&
    !emptyOwnsSoft &&
    (isDemo || micDenied || Boolean(error) || softNotice);
  const talkSoftCopy = micDenied
    ? t(uiLocale, "translate.permissionMic")
    : softNotice && !online
      ? t(uiLocale, "translate.softOffline")
      : isDemo || (error && isNoiseError(new Error(error)))
        ? t(uiLocale, "translate.talkSoftFail")
        : error
          ? t(uiLocale, "translate.error")
          : t(uiLocale, "translate.talkSoftFail");

  /**
   * Expo translate dual SoftFailNotice chrome (BEA-261 after Lens #180 / Talk #150):
   * foam dual rail · azure head · compact SoftFailNotice · tip-011 (#46) ·
   * StyleSheet.flatten. Soft-fail never timber / Failed to fetch.
   * Hero SoftFailNotice yields while Dual owns soft-fail (no double depth).
   */
  const dualSoftOpen =
    tab === "camera" && (isDemo || camDenied || Boolean(error) || softNotice);
  const dualSoftCopy = camDenied
    ? t(uiLocale, "translate.permissionCamera")
    : softNotice && !online
      ? t(uiLocale, "translate.softOffline")
      : isDemo || (error && isNoiseError(new Error(error)))
        ? t(uiLocale, "translate.dualSoftFail")
        : error
          ? t(uiLocale, "translate.error")
          : t(uiLocale, "translate.dualSoftFail");

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) reduceMotionRef.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    historyRise.setValue(0);
    Animated.timing(historyRise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [historyRise, tab, sourceLocale, targetLocale]);

  /* Tip 011 / #46 — hold-to-talk listen pulse (match web animate-hold-listen). */
  useEffect(() => {
    if (!listening || reduceMotionRef.current) {
      holdListen.stopAnimation();
      holdListen.setValue(0);
      return;
    }
    holdListen.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(holdListen, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(holdListen, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      holdListen.setValue(0);
    };
  }, [holdListen, listening]);

  const historyRiseStyle = {
    opacity: historyRise,
    transform: [
      {
        translateY: historyRise.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  const holdHaloStyle = {
    opacity: holdListen.interpolate({
      inputRange: [0, 1],
      outputRange: [0.42, 0],
    }),
    transform: [
      {
        scale: holdListen.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.28],
        }),
      },
    ],
  };

  const holdMicScaleStyle = {
    transform: [
      {
        scale: holdListen.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.015],
        }),
      },
    ],
  };

  function focusComposer(mode: "mic" | "draft" = "mic") {
    if (mode === "draft") {
      draftRef.current?.focus();
      return;
    }
    scrollRef.current?.scrollToEnd({ animated: true });
  }

  const refreshQueue = useCallback(async () => {
    setQueue(await listQueuedTranslations(queueStore));
  }, [queueStore]);

  useEffect(() => {
    const syncOnline = () => setOnline(isDeviceOnline());
    syncOnline();
    if (typeof window === "undefined") return;
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    void fetchTranslationStatus()
      .then((res) => {
        setStatus(res);
        setSoftNotice(res.mode === "demo");
      })
      .catch(() => {
        setStatus(softDemoStatus());
        setSoftNotice(true);
      });
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

  useEffect(() => {
    const key = `${sourceLocale}|${targetLocale}`;
    if (seededPairRef.current === key) return;
    seededPairRef.current = key;
    setTurns(seedTurns(sourceLocale, targetLocale));
    setDemoIndex(2);
    setOverlay(null);
  }, [sourceLocale, targetLocale]);

  const speakTranslation = useCallback(
    async (text: string, locale: string, audio?: LiveTurnResponse["tts"]) => {
      if (!text || !ttsEnabled) return;
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
    [ttsEnabled],
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

  const localDemoTurn = useCallback(
    async (input: { text?: string }) => {
      const text = input.text?.trim();
      if (text) {
        const hit = offlinePhraseTranslate(text, sourceLocale, targetLocale);
        const translated =
          hit?.translatedText ?? `[${targetLocale}] ${text}`;
        pushTurn({
          sourceText: text,
          translatedText: translated,
          pair: { sourceLocale, targetLocale },
          asrProvider: "demo-asr",
          translateProvider: "demo-llm",
          mode: "demo",
          tts: null,
        });
        await speakTranslation(translated, targetLocale);
        return;
      }
      const turn = pickDemoTurn({ sourceLocale, targetLocale }, demoIndex);
      pushTurn({
        sourceText: turn.sourceText,
        translatedText: turn.translatedText,
        pair: { sourceLocale, targetLocale },
        asrProvider: "demo-asr",
        translateProvider: "demo-llm",
        mode: "demo",
        tts: null,
      });
      await speakTranslation(turn.translatedText, targetLocale);
    },
    [demoIndex, pushTurn, sourceLocale, speakTranslation, targetLocale],
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
      const res = await runTranslationTurn({
        ...input,
        sourceLocale,
        targetLocale,
        withTts: ttsEnabled,
        demoTurnIndex: demoIndex,
      });
      pushTurn(res);
      await speakTranslation(res.translatedText, targetLocale, res.tts);
    } catch {
      setSoftNotice(true);
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
        await localDemoTurn({});
      }
    } finally {
      setBusy(false);
    }
  }

  async function startListening() {
    setError(null);
    setMicDenied(false);
    setPartialText("");
    sequenceRef.current = 0;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setMicDenied(true);
        setSoftNotice(true);
        await localDemoTurn({});
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
      setMicDenied(false);
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
            const turn = pickDemoTurn(
              { sourceLocale, targetLocale },
              demoIndex,
            );
            setPartialText(turn.sourceText.slice(0, 18) + "…");
          });
      }, 900);
    } catch {
      setMicDenied(true);
      setSoftNotice(true);
      await localDemoTurn({});
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
          setSoftNotice(true);
          const demo = demoVisionAssist(
            { sourceLocale, targetLocale },
            mode,
          );
          setOverlay({
            source: demo.sourceText,
            translated: demo.translatedText,
          });
          pushTurn({
            sourceText: demo.sourceText,
            translatedText: demo.translatedText,
            pair: { sourceLocale, targetLocale },
            asrProvider: "vision",
            translateProvider: "demo-vision",
            mode: "demo",
            tts: null,
          });
          await speakTranslation(demo.translatedText, targetLocale);
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
      try {
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
        setSoftNotice(true);
        const demo = demoVisionAssist(
          { sourceLocale, targetLocale },
          mode,
        );
        setOverlay({
          source: demo.sourceText,
          translated: demo.translatedText,
        });
        pushTurn({
          sourceText: demo.sourceText,
          translatedText: demo.translatedText,
          pair: { sourceLocale, targetLocale },
          asrProvider: "vision",
          translateProvider: "demo-vision",
          mode: "demo",
          tts: null,
        });
        await speakTranslation(demo.translatedText, targetLocale);
      }
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

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroWash} />
          <Text style={styles.brandSecondary}>{brand.en}</Text>
          <Text style={styles.brandPrimary}>{brand.zh}</Text>
          <Text style={styles.eyebrow}>{t(uiLocale, "translate.eyebrow")}</Text>
          <Text style={styles.title}>{t(uiLocale, "mobile.translate")}</Text>
          <Text style={styles.support}>{t(uiLocale, "translate.support")}</Text>
          <View style={styles.badgeRow}>
            {!status ? (
              <>
                <View style={[styles.badgeSoft, styles.statusSkeleton]} />
                <View style={[styles.badgeSoft, styles.statusSkeletonWide]} />
                <View style={[styles.badgeSoft, styles.statusSkeleton]} />
              </>
            ) : (
              <>
                <View
                  style={[
                    styles.badge,
                    isDemo ? styles.badgeDemo : styles.badgeLive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      isDemo ? styles.badgeTextDemo : styles.badgeTextLive,
                    ]}
                  >
                    {isDemo
                      ? t(uiLocale, "translate.demoBadge")
                      : t(uiLocale, "translate.liveBadge")}
                  </Text>
                </View>
                <View style={styles.badgeSoft}>
                  <Text style={styles.badgeSoftText}>
                    {t(uiLocale, "translate.asrReady")} · {status.asr}
                  </Text>
                </View>
                <View style={styles.badgeSoft}>
                  <Text style={styles.badgeSoftText}>
                    {t(uiLocale, "translate.ttsReady")} · {status.tts}
                  </Text>
                </View>
              </>
            )}
          </View>
          {/* Hero SoftFail yields while empty / Talk / Dual own soft-fail — no double depth. */}
          <SoftFailNotice
            open={isDemo && !emptyOwnsSoft && !talkSoftOpen && !dualSoftOpen}
            style={styles.heroSoftNotice}
          >
            {softNotice && !online
              ? t(uiLocale, "translate.softOffline")
              : t(uiLocale, "translate.demoNotice")}
          </SoftFailNotice>
        </View>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab("conversation")}
            style={StyleSheet.flatten([
              styles.tab,
              tab === "conversation" ? styles.tabActive : null,
            ])}
          >
            <Text
              style={StyleSheet.flatten([
                styles.tabLabel,
                tab === "conversation" ? styles.tabLabelActive : null,
              ])}
            >
              {t(uiLocale, "translate.mode.conversation")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("camera")}
            style={StyleSheet.flatten([
              styles.tab,
              tab === "camera" ? styles.tabActive : null,
            ])}
          >
            <Text
              style={StyleSheet.flatten([
                styles.tabLabel,
                tab === "camera" ? styles.tabLabelActive : null,
              ])}
            >
              {t(uiLocale, "translate.mode.camera")}
            </Text>
          </Pressable>
        </View>

        <View
          style={styles.pairStage}
          accessibilityLabel={t(uiLocale, "translate.pairLabel")}
        >
          <View style={styles.pairHead}>
            <View style={styles.pairHeadCopy}>
              <Text style={styles.pairEyebrow}>
                {t(uiLocale, "translate.pairLabel")}
              </Text>
              <Text style={styles.pairHint}>
                {t(uiLocale, "translate.pairHint")}
              </Text>
            </View>
            <View style={styles.pairDirectionChip}>
              <Text style={styles.pairDirectionText}>
                {localeLabel(sourceLocale, uiLocale)}
                {" → "}
                {localeLabel(targetLocale, uiLocale)}
              </Text>
            </View>
          </View>
          <View style={styles.pairBody}>
            <LocalePicker
              label={t(uiLocale, "translate.source")}
              value={sourceLocale}
              locales={orderedLocales}
              onChange={setSourceLocale}
            />
            <Pressable
              onPress={onSwap}
              style={styles.swapBtn}
              accessibilityLabel={t(uiLocale, "translate.swap")}
            >
              <Text style={styles.swapLabel}>⇄</Text>
            </Pressable>
            <LocalePicker
              label={t(uiLocale, "translate.target")}
              value={targetLocale}
              locales={orderedLocales}
              onChange={setTargetLocale}
            />
          </View>
        </View>

        {tab === "conversation" ? (
          <View style={styles.panel}>
            {(listening || partialText) ? (
              <Text style={styles.partial}>
                {t(uiLocale, "translate.partialHint")} {partialText || "…"}
              </Text>
            ) : null}

            {/*
              Empty SoftFail chrome (BEA-229 after #171):
              azure history rail · Open badge · compact SoftFailNotice ·
              SheetPresence empty body · tip-011 rise — never timber.
            */}
            <Animated.View
              style={StyleSheet.flatten([styles.historyStage, historyRiseStyle])}
              accessibilityLabel={t(uiLocale, "translate.history")}
            >
              <View style={styles.historyHead}>
                <View style={styles.historyHeadCopy}>
                  <Text style={styles.historyEyebrow}>
                    {t(uiLocale, "translate.history")}
                  </Text>
                  <Text style={styles.historyHint}>
                    {historyEmpty
                      ? t(uiLocale, "translate.emptySupport")
                      : t(uiLocale, "translate.historyHint")}
                  </Text>
                </View>
                {historyEmpty ? (
                  <View
                    style={StyleSheet.flatten([
                      styles.historyEmptyBadge,
                      emptySoftOpen
                        ? styles.historyEmptyBadgeSoft
                        : styles.historyEmptyBadgeLive,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.historyEmptyBadgeText,
                        emptySoftOpen
                          ? styles.historyEmptyBadgeTextSoft
                          : styles.historyEmptyBadgeTextLive,
                      ])}
                    >
                      {t(uiLocale, "translate.emptyBadge")}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.historyCountChip}>
                    <Text style={styles.historyCountText}>
                      {t(uiLocale, "translate.historyCount").replace(
                        "{n}",
                        String(turns.length),
                      )}
                    </Text>
                  </View>
                )}
              </View>

              {/* Compact SoftFail under azure rail — never timber / Failed to fetch. */}
              <SoftFailNotice
                open={emptySoftOpen}
                compact
                style={styles.historySoftFail}
              >
                {emptySoftCopy}
              </SoftFailNotice>

              {busy && historyEmpty ? (
                <HistorySkeleton rows={2} />
              ) : historyEmpty ? (
                <SheetPresence
                  open
                  delayMs={40}
                  rise={12}
                  style={styles.historyEmpty}
                  accessibilityLabel={t(uiLocale, "translate.empty")}
                >
                  <SheetPresence open delayMs={40} rise={8}>
                    <Text style={styles.historyEmptyEyebrow}>
                      {t(uiLocale, "translate.history")}
                    </Text>
                  </SheetPresence>
                  <SheetPresence open delayMs={70} rise={8}>
                    <Text style={styles.historyEmptyTitle}>
                      {t(uiLocale, "translate.empty")}
                    </Text>
                  </SheetPresence>
                  <SheetPresence open delayMs={100} rise={6}>
                    <Text style={styles.historyEmptyHint}>
                      {t(uiLocale, "translate.emptyHint")}
                    </Text>
                  </SheetPresence>
                  <SheetPresence open delayMs={130} rise={6}>
                    <View style={styles.historyEmptyCtas}>
                      <Pressable
                        style={StyleSheet.flatten([styles.emptyCtaPrimary])}
                        onPress={() => focusComposer("mic")}
                        accessibilityRole="button"
                      >
                        <Text style={styles.emptyCtaPrimaryLabel}>
                          {t(uiLocale, "translate.emptyCta")}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={StyleSheet.flatten([
                          styles.emptyCtaSecondary,
                          busy ? styles.disabled : null,
                        ])}
                        onPress={() => void runTurn({})}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy }}
                      >
                        <Text style={styles.emptyCtaSecondaryLabel}>
                          {t(uiLocale, "translate.nextDemo")}
                        </Text>
                      </Pressable>
                    </View>
                  </SheetPresence>
                </SheetPresence>
              ) : (
                <View>
                  {busy ? <HistorySkeleton rows={1} /> : null}
                  {turns.map((row, idx) => (
                    <HistoryTurn
                      key={row.id}
                      row={row}
                      index={idx}
                      onSpeak={() =>
                        void speakTranslation(row.translatedText, targetLocale)
                      }
                    />
                  ))}
                </View>
              )}
            </Animated.View>

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
                    void speakTranslation(
                      phrase.translatedText,
                      targetLocale,
                    );
                  }}
                >
                  <Text style={styles.bubbleSource}>{phrase.sourceText}</Text>
                  <Text style={styles.bubbleTarget}>
                    {phrase.translatedText}
                  </Text>
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

            <View
              style={styles.talkRail}
              accessibilityLabel={t(uiLocale, "translate.talkRail")}
            >
              {/*
                Talk SoftFail chrome (BEA-266 after #150 / empty #178):
                foam sheet · azure head · talkSupport · mist soft badge ·
                compact SoftFailNotice · tip-011 SheetPresence — never timber.
              */}
              <View style={styles.talkHead}>
                <View style={styles.talkHeadTitles}>
                  <Text style={styles.talkEyebrow}>
                    {t(uiLocale, "translate.talkRail")}
                  </Text>
                  <Text style={styles.talkHint}>
                    {talkSoftOpen
                      ? t(uiLocale, "translate.talkSupport")
                      : t(uiLocale, "translate.talkHint")}
                  </Text>
                </View>
                <View style={styles.talkHeadBadges}>
                  <View
                    style={StyleSheet.flatten([
                      styles.talkSoftBadgeWrap,
                      talkSoftOpen
                        ? styles.talkSoftBadgeSoft
                        : styles.talkSoftBadgeLive,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.talkSoftBadgeText,
                        talkSoftOpen
                          ? styles.talkSoftBadgeTextSoft
                          : styles.talkSoftBadgeTextLive,
                      ])}
                    >
                      {talkSoftOpen
                        ? t(uiLocale, "translate.talkDemoBadge")
                        : t(uiLocale, "translate.talkLiveBadge")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setTtsEnabled((v) => !v)}
                    style={StyleSheet.flatten([
                      styles.ttsChip,
                      ttsEnabled ? styles.ttsChipOn : styles.ttsChipOff,
                    ])}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ttsEnabled }}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.ttsChipText,
                        ttsEnabled ? styles.ttsChipTextOn : null,
                      ])}
                    >
                      {t(uiLocale, "translate.ttsReady")}{" "}
                      {ttsEnabled ? "· on" : "· off"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Compact SoftFail under azure rail — yields while empty owns soft-fail. */}
              <SoftFailNotice
                open={talkSoftOpen && Boolean(talkSoftCopy)}
                compact
                style={styles.talkSoftFail}
              >
                {talkSoftCopy ?? ""}
              </SoftFailNotice>

              <SheetPresence
                open
                delayMs={40}
                rise={12}
                style={styles.talkBody}
                accessibilityLabel={t(uiLocale, "translate.talkRail")}
              >
                <SheetPresence open delayMs={40} rise={8}>
                  <View style={styles.compose}>
                    <TextInput
                      ref={draftRef}
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={t(uiLocale, "translate.typeHint")}
                      placeholderTextColor={colors.inkSoft}
                      style={styles.input}
                      editable={!busy}
                      onSubmitEditing={() => void onSendText()}
                      returnKeyType="send"
                    />
                    <Pressable
                      style={StyleSheet.flatten([
                        styles.sendBtn,
                        busy ? styles.disabled : null,
                      ])}
                      onPress={() => void onSendText()}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                    >
                      <Text style={styles.sendLabel}>
                        {busy
                          ? t(uiLocale, "translate.translating")
                          : t(uiLocale, "translate.send")}
                      </Text>
                    </Pressable>
                  </View>
                </SheetPresence>

                <SheetPresence open delayMs={90} rise={8}>
                  <View style={styles.micRow}>
                    <View style={styles.micWrap}>
                      {listening ? (
                        <Animated.View
                          pointerEvents="none"
                          style={StyleSheet.flatten([
                            styles.micHalo,
                            holdHaloStyle,
                          ])}
                        />
                      ) : null}
                      <Animated.View
                        style={StyleSheet.flatten([
                          styles.micBtnShell,
                          listening ? holdMicScaleStyle : null,
                        ])}
                      >
                        <Pressable
                          ref={micRef}
                          onPressIn={() => void startListening()}
                          onPressOut={() => void stopListening()}
                          style={StyleSheet.flatten([
                            styles.micBtn,
                            listening ? styles.micBtnActive : null,
                            busy && !listening ? styles.disabled : null,
                          ])}
                          disabled={busy && !listening}
                          accessibilityRole="button"
                          accessibilityState={{ selected: listening }}
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
                      </Animated.View>
                    </View>
                    <Pressable
                      style={StyleSheet.flatten([
                        styles.demoNext,
                        busy ? styles.disabled : null,
                      ])}
                      onPress={() => void runTurn({})}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                    >
                      <Text style={styles.demoNextLabel}>
                        {t(uiLocale, "translate.nextDemo")}
                      </Text>
                    </Pressable>
                  </View>
                </SheetPresence>
              </SheetPresence>
            </View>
          </View>
        ) : (
          <Animated.View
            style={StyleSheet.flatten([styles.dualRail, historyRiseStyle])}
            accessibilityLabel={t(uiLocale, "translate.mode.camera")}
          >
            {/*
              Dual SoftFail chrome (BEA-261 after Lens #180 / Talk #150):
              foam dual rail · azure head · compact SoftFailNotice · dual stage ·
              tip-011 SheetPresence — never timber / Failed to fetch.
            */}
            <View style={styles.dualHead}>
              <View style={styles.dualHeadTitles}>
                <Text style={styles.dualEyebrow}>
                  {t(uiLocale, "translate.mode.camera")}
                </Text>
                <Text style={styles.dualHint}>
                  {dualSoftOpen
                    ? t(uiLocale, "translate.dualSupport")
                    : t(uiLocale, "translate.dualHint")}
                </Text>
              </View>
              <View style={styles.dualHeadBadges}>
                <View
                  style={StyleSheet.flatten([
                    styles.dualSoftBadgeWrap,
                    dualSoftOpen
                      ? styles.dualSoftBadgeSoft
                      : styles.dualSoftBadgeLive,
                  ])}
                >
                  <Text
                    style={StyleSheet.flatten([
                      styles.dualSoftBadgeText,
                      dualSoftOpen
                        ? styles.dualSoftBadgeTextSoft
                        : styles.dualSoftBadgeTextLive,
                    ])}
                  >
                    {dualSoftOpen
                      ? t(uiLocale, "translate.dualDemoBadge")
                      : t(uiLocale, "translate.dualLiveBadge")}
                  </Text>
                </View>
              </View>
            </View>

            {/* Compact SoftFail under azure dual rail — never timber / Failed to fetch. */}
            <SoftFailNotice
              open={dualSoftOpen && Boolean(dualSoftCopy)}
              compact
              style={styles.dualSoftFail}
            >
              {dualSoftCopy ?? ""}
            </SoftFailNotice>

            <SheetPresence
              open
              delayMs={40}
              rise={12}
              style={styles.dualBody}
              accessibilityLabel={t(uiLocale, "translate.dualHint")}
            >
              <View style={styles.dualFrame}>
                <View style={styles.dualStage}>
                  {/* Traveler lens */}
                  <View
                    style={StyleSheet.flatten([
                      styles.lensPane,
                      styles.lensYou,
                    ])}
                  >
                    <View style={styles.lensYouWash} />
                    <View style={styles.lensYouGlow} />
                    <View style={styles.lensBadgeWrap}>
                      <Text style={styles.lensBadgeText}>
                        {t(uiLocale, "translate.lensYou")} ·{" "}
                        {t(uiLocale, "translate.cameraFront")}
                      </Text>
                    </View>
                    <View style={styles.avatarOuter}>
                      <View style={styles.avatarInner} />
                    </View>
                    <Text style={styles.lensFooterLabel}>
                      {t(uiLocale, "translate.source")}
                    </Text>
                  </View>

                  {/* World lens */}
                  <View style={styles.lensPane}>
                    {camPermission?.granted ? (
                      <CameraView
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        facing={facing}
                      />
                    ) : (
                      <View style={styles.cameraFallback}>
                        <View style={styles.cameraFallbackGlow} />
                        {/* SoftFail owns permission/demo copy — pane keeps a calm stage hint. */}
                        <Text style={styles.cameraFallbackText}>
                          {t(uiLocale, "translate.cameraHint")}
                        </Text>
                        <Pressable
                          style={StyleSheet.flatten([styles.enableCamBtn])}
                          onPress={() => {
                            void requestCamPermission().then((next) => {
                              if (!next.granted) setSoftNotice(true);
                            });
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.sendLabel}>
                            {t(uiLocale, "translate.enableCamera")}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                    <View style={styles.lensBadgeWrap}>
                      <Text style={styles.lensBadgeText}>
                        {t(uiLocale, "translate.lensWorld")} ·{" "}
                        {facing === "back"
                          ? t(uiLocale, "translate.cameraBack")
                          : t(uiLocale, "translate.cameraFront")}
                      </Text>
                    </View>
                    {busy && tab === "camera" && !overlay ? (
                      <View style={styles.visionBusy}>
                        <View style={styles.skeletonLineSm} />
                        <View style={styles.skeletonLineLg} />
                      </View>
                    ) : null}
                    {overlay ? (
                      <View style={styles.subtitle}>
                        <Text style={styles.subtitleMeta}>
                          {t(uiLocale, "translate.target")}
                        </Text>
                        <Text style={styles.subtitleSource}>
                          {overlay.source}
                        </Text>
                        {overlay.translated ? (
                          <Text style={styles.subtitleTarget}>
                            {overlay.translated}
                          </Text>
                        ) : null}
                        {busy ? (
                          <View
                            style={StyleSheet.flatten([
                              styles.skeletonLineSm,
                              { marginTop: 8 },
                            ])}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Control chrome rail */}
                <View style={styles.controlChrome}>
                  <Pressable
                    style={StyleSheet.flatten([styles.facingBtn])}
                    onPress={() =>
                      setFacing((f) => (f === "back" ? "front" : "back"))
                    }
                    accessibilityRole="button"
                  >
                    <Text style={styles.facingLabel}>
                      {facing === "back"
                        ? t(uiLocale, "translate.cameraFront")
                        : t(uiLocale, "translate.cameraBack")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={StyleSheet.flatten([
                      styles.visionBtn,
                      busy ? styles.disabled : null,
                    ])}
                    onPress={() => void onVision("ocr")}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                  >
                    <Text style={styles.visionLabel}>
                      {busy
                        ? t(uiLocale, "translate.translating")
                        : t(uiLocale, "translate.ocr")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={StyleSheet.flatten([
                      styles.visionBtnAlt,
                      busy ? styles.disabled : null,
                    ])}
                    onPress={() => void onVision("caption")}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                  >
                    <Text style={styles.visionLabelAlt}>
                      {t(uiLocale, "translate.caption")}
                    </Text>
                  </Pressable>
                  <Text style={styles.controlMeta}>
                    {camPermission?.granted
                      ? t(uiLocale, "translate.lensWorld")
                      : camDenied
                        ? t(uiLocale, "translate.demoBadge")
                        : t(uiLocale, "translate.loading")}
                  </Text>
                </View>
              </View>
            </SheetPresence>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HistorySkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" style={styles.historySkeleton}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.historySkeletonRow}>
          <View style={styles.historySkeletonCol}>
            <View style={styles.skeletonBarSm} />
            <View style={styles.skeletonBarMd} />
            <View style={styles.skeletonBarSmWide} />
          </View>
          <View style={styles.historySkeletonCol}>
            <View style={styles.skeletonBarSm} />
            <View style={styles.skeletonBarLg} />
            <View style={styles.skeletonBarMd} />
          </View>
        </View>
      ))}
    </View>
  );
}

function HistoryTurn({
  row,
  index,
  onSpeak,
}: {
  row: TurnRow;
  index: number;
  onSpeak: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.durationSmMs,
      delay: Math.min(index, 4) * 40,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [enter, index, row.id]);

  const enterStyle = {
    opacity: enter,
    transform: [
      {
        translateY: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  const modeLabel =
    row.mode === "live"
      ? t(uiLocale, "translate.liveBadge")
      : row.mode === "offline"
        ? t(uiLocale, "translate.offlineBadge")
        : t(uiLocale, "translate.demoBadge");

  return (
    <Animated.View style={StyleSheet.flatten([styles.turnRow, enterStyle])}>
      <View style={styles.turnMetaRow}>
        <View
          style={StyleSheet.flatten([
            styles.modeBadge,
            row.mode === "live"
              ? styles.modeBadgeLive
              : row.mode === "offline"
                ? styles.modeBadgeOffline
                : styles.modeBadgeDemo,
          ])}
        >
          <Text
            style={StyleSheet.flatten([
              styles.modeBadgeText,
              row.mode === "live"
                ? styles.modeBadgeTextLive
                : row.mode === "offline"
                  ? styles.modeBadgeTextOffline
                  : styles.modeBadgeTextDemo,
            ])}
          >
            {modeLabel}
          </Text>
        </View>
        {row.translatedText ? (
          <Pressable onPress={onSpeak} hitSlop={8}>
            <Text style={styles.speakAction}>
              {t(uiLocale, "translate.speak")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.turnCols}>
        <View style={styles.turnCol}>
          <Text style={styles.turnMeta}>
            {t(uiLocale, "translate.source")}
          </Text>
          <Text style={styles.bubbleSource}>{row.sourceText}</Text>
        </View>
        <View style={styles.turnCol}>
          <Text style={styles.turnMetaTarget}>
            {t(uiLocale, "translate.target")}
          </Text>
          <Text style={styles.bubbleTarget}>{row.translatedText}</Text>
        </View>
      </View>
    </Animated.View>
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
            style={StyleSheet.flatten([
              styles.localeChip,
              value === loc ? styles.localeChipActive : null,
            ])}
          >
            <Text
              style={StyleSheet.flatten([
                styles.localeChipText,
                value === loc ? styles.localeChipTextActive : null,
              ])}
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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    overflow: "hidden",
    backgroundColor: colors.foam,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  heroWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(219, 232, 255, 0.55)",
  },
  brandSecondary: {
    color: colors.river,
    letterSpacing: 2.8,
    textTransform: "uppercase",
    fontSize: 10,
    fontWeight: "700",
  },
  brandPrimary: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  eyebrow: {
    marginTop: 10,
    color: colors.inkSoft,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  support: {
    marginTop: 8,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  badgeRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeDemo: { backgroundColor: "rgba(47, 107, 255, 0.12)" },
  badgeLive: { backgroundColor: colors.river },
  badgeText: { fontSize: 11, fontWeight: "700" },
  badgeTextDemo: { color: colors.riverDeep },
  badgeTextLive: { color: colors.foam },
  badgeSoft: {
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.mist,
  },
  badgeSoftText: { color: colors.inkSoft, fontSize: 11, fontWeight: "600" },
  statusSkeleton: {
    width: 72,
    height: 22,
    backgroundColor: colors.mist,
  },
  statusSkeletonWide: {
    width: 110,
    height: 22,
    backgroundColor: colors.mist,
  },
  heroSoftNotice: {
    marginTop: 12,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    gap: 6,
    padding: 5,
    borderRadius: radius.md,
    backgroundColor: colors.mist,
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.river,
  },
  tabLabel: { color: colors.inkSoft, fontWeight: "600", fontSize: 14 },
  tabLabelActive: { color: colors.foam },
  pairStage: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    overflow: "hidden",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  pairHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.6)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pairHeadCopy: { flex: 1, minWidth: 160, gap: 4 },
  pairEyebrow: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  pairHint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  pairDirectionChip: {
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pairDirectionText: {
    ...type.body,
    color: colors.riverDeep,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pairBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  localeCol: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    padding: 10,
  },
  localeLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 6,
    fontWeight: "700",
  },
  localeChips: { gap: 6 },
  localeChip: {
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  localeChipActive: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  localeChipText: { fontSize: 12, color: colors.inkSoft },
  localeChipTextActive: { color: colors.foam, fontWeight: "600" },
  swapBtn: {
    marginTop: 28,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.river,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  swapLabel: { fontSize: 16, color: colors.foam, fontWeight: "700" },
  panel: { marginTop: 8 },
  historyStage: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    overflow: "hidden",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  historyHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    backgroundColor: "rgba(244, 246, 250, 0.72)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  historyHeadCopy: { flex: 1, minWidth: 160, gap: 4 },
  historyEyebrow: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  historyHint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  historyCountChip: {
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyCountText: {
    ...type.body,
    color: colors.riverDeep,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  historyEmptyBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyEmptyBadgeSoft: {
    backgroundColor: colors.mist,
  },
  historyEmptyBadgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  historyEmptyBadgeText: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  historyEmptyBadgeTextSoft: {
    color: colors.inkSoft,
  },
  historyEmptyBadgeTextLive: {
    color: colors.riverDeep,
  },
  historySoftFail: {
    marginBottom: 0,
  },
  historyEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    gap: 10,
    maxWidth: 420,
  },
  historyEmptyEyebrow: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  historyEmptyTitle: {
    ...type.display,
    color: colors.ink,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  historyEmptyHint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  historyEmptyCtas: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  emptyCtaPrimary: {
    borderRadius: radius.md,
    backgroundColor: colors.river,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyCtaPrimaryLabel: {
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyCtaSecondary: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyCtaSecondaryLabel: {
    color: colors.river,
    fontSize: 14,
    fontWeight: "600",
  },
  historySkeleton: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  historySkeletonRow: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  historySkeletonCol: { flex: 1, gap: 8 },
  skeletonBarSm: {
    height: 10,
    width: 56,
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
  },
  skeletonBarSmWide: {
    height: 12,
    width: "55%",
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
  },
  skeletonBarMd: {
    height: 12,
    width: "88%",
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
  },
  skeletonBarLg: {
    height: 18,
    width: "78%",
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
  },
  turnRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  turnMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  modeBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeBadgeLive: { backgroundColor: colors.river },
  modeBadgeOffline: { backgroundColor: colors.mist },
  modeBadgeDemo: { backgroundColor: "rgba(47, 107, 255, 0.12)" },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  modeBadgeTextLive: { color: colors.foam },
  modeBadgeTextOffline: { color: colors.inkSoft },
  modeBadgeTextDemo: { color: colors.riverDeep },
  speakAction: {
    marginLeft: "auto",
    color: colors.river,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  turnCols: { gap: 12 },
  turnCol: { gap: 4 },
  turnMeta: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
    fontWeight: "700",
  },
  turnMetaTarget: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  bubbleSource: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  bubbleTarget: {
    ...type.display,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  talkRail: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    overflow: "hidden",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 3,
  },
  talkHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    backgroundColor: "rgba(244, 246, 250, 0.72)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  talkHeadTitles: { flex: 1, minWidth: 160, gap: 4 },
  talkHeadBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  talkSoftBadgeWrap: {
    borderRadius: radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  talkSoftBadgeSoft: {
    backgroundColor: colors.mist,
  },
  talkSoftBadgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  talkSoftBadgeText: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  talkSoftBadgeTextSoft: {
    color: colors.inkSoft,
  },
  talkSoftBadgeTextLive: {
    color: colors.riverDeep,
  },
  talkEyebrow: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  talkHint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  talkBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  talkSoftFail: {
    marginBottom: 0,
  },
  compose: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
  },
  sendBtn: {
    borderRadius: radius.sm,
    backgroundColor: colors.river,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  sendLabel: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  ttsChip: {
    alignSelf: "flex-start",
    borderRadius: radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ttsChipOn: { backgroundColor: "rgba(47, 107, 255, 0.12)" },
  ttsChipOff: { backgroundColor: colors.mist },
  ttsChipText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  ttsChipTextOn: { color: colors.riverDeep },
  micRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 10,
  },
  micWrap: {
    flex: 1,
    minWidth: 160,
    position: "relative",
    justifyContent: "center",
  },
  micHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
    backgroundColor: "rgba(47, 107, 255, 0.28)",
  },
  micBtnShell: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  micBtn: {
    borderRadius: radius.md,
    backgroundColor: colors.river,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  micBtnActive: { backgroundColor: colors.ink },
  micLabel: { color: colors.foam, fontSize: 15, fontWeight: "700" },
  demoNext: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  demoNextLabel: { color: colors.river, fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.55 },
  /** Foam dual rail — Talk #150 / Lens #180 SoftFail sheet parity (BEA-261). */
  dualRail: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    overflow: "hidden",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 3,
  },
  dualHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    backgroundColor: "rgba(244, 246, 250, 0.72)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dualHeadTitles: { flex: 1, minWidth: 160, gap: 4 },
  dualHeadBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  dualSoftBadgeWrap: {
    borderRadius: radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dualSoftBadgeSoft: {
    backgroundColor: colors.mist,
  },
  dualSoftBadgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  dualSoftBadgeText: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  dualSoftBadgeTextSoft: {
    color: colors.inkSoft,
  },
  dualSoftBadgeTextLive: {
    color: colors.riverDeep,
  },
  dualEyebrow: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  dualHint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  /** Mist SoftFail strip under azure dual rail — Talk SoftFail parity. */
  dualSoftFail: {
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dualBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dualFrame: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
  },
  dualStage: {
    backgroundColor: colors.ink,
    minHeight: 360,
  },
  lensPane: {
    minHeight: 180,
    position: "relative",
    overflow: "hidden",
  },
  lensYou: {
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  lensYouWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.riverDeep,
    opacity: 0.92,
  },
  lensYouGlow: {
    position: "absolute",
    width: 220,
    height: 160,
    borderRadius: 110,
    top: 18,
    left: "18%",
    backgroundColor: "rgba(47, 107, 255, 0.42)",
  },
  lensBadgeWrap: {
    position: "absolute",
    left: 12,
    top: 12,
    zIndex: 2,
    borderRadius: radius.xs,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lensBadgeText: {
    color: colors.foam,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  avatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  avatarInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(47, 107, 255, 0.35)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  lensFooterLabel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    textAlign: "center",
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    zIndex: 1,
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 14,
    backgroundColor: colors.ink,
  },
  cameraFallbackGlow: {
    position: "absolute",
    width: 200,
    height: 140,
    borderRadius: 100,
    backgroundColor: "rgba(96, 165, 250, 0.28)",
    top: "28%",
    right: "12%",
  },
  cameraFallbackText: {
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 20,
    fontSize: 14,
    maxWidth: 280,
    zIndex: 1,
  },
  enableCamBtn: {
    borderRadius: radius.sm,
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 1,
  },
  subtitle: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(15, 23, 42, 0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
    gap: 4,
    zIndex: 3,
  },
  subtitleMeta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  subtitleSource: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    lineHeight: 16,
  },
  subtitleTarget: {
    color: colors.foam,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  visionBusy: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    padding: 12,
    gap: 8,
    zIndex: 3,
  },
  skeletonLineSm: {
    height: 10,
    width: "42%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  skeletonLineLg: {
    height: 16,
    width: "68%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  controlChrome: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  facingBtn: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "center",
  },
  facingLabel: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  visionBtn: {
    borderRadius: radius.sm,
    backgroundColor: colors.river,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  visionBtnAlt: {
    borderRadius: radius.sm,
    backgroundColor: colors.riverDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  visionLabel: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  visionLabelAlt: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  controlMeta: {
    marginLeft: "auto",
    color: "rgba(100, 116, 139, 0.7)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  partial: {
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.2)",
    backgroundColor: colors.foam,
    color: colors.riverDeep,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  phraseHead: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  phraseTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
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
  queueNote: { color: colors.inkSoft, fontSize: 12 },
});
