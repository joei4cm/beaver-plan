import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  journalForDay,
  stopsForDay,
  type Day,
  type JournalEntry,
  type Stop,
  type Trip,
} from "@beaver/core";
import { colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import {
  createJournalEntry,
  fetchJournal,
  fetchTrip,
  resolveMediaUrl,
  uploadMediaBase64,
} from "../../../src/api";

const locale = "zh-CN" as const;

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tripData, journal] = await Promise.all([
        fetchTrip(tripId),
        fetchJournal(tripId),
      ]);
      setTrip(tripData.trip);
      setDays(tripData.days);
      setStops(tripData.stops);
      setEntries(journal.entries);
      setDayId((prev) => prev ?? tripData.days[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );
  const visible = useMemo(() => {
    if (!dayId) return entries;
    return journalForDay(
      entries,
      dayId,
      dayStops.map((s) => s.id),
    );
  }, [entries, dayId, dayStops]);

  async function capture() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("permission_denied");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (picked.canceled) return;
    try {
      const urls: string[] = [];
      for (const asset of picked.assets.slice(0, 4)) {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const uploaded = await uploadMediaBase64({
          tripId,
          contentType: asset.mimeType ?? "image/jpeg",
          dataBase64: b64,
        });
        urls.push(uploaded.key ?? uploaded.url);
      }
      setPendingMedia((prev) => [...prev, ...urls].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    }
  }

  async function save() {
    if (!body.trim() && pendingMedia.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await createJournalEntry(tripId, {
        dayId: dayId ?? undefined,
        body: body.trim(),
        media: pendingMedia,
      });
      setBody("");
      setPendingMedia([]);
      const journal = await fetchJournal(tripId);
      setEntries(journal.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "mobile.journal") }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>{t(locale, "journal.eyebrow")}</Text>
          <Text style={styles.title}>{trip?.title ?? "—"}</Text>
          <Text style={styles.support}>{t(locale, "journal.support")}</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
          >
            {days.map((day, i) => (
              <Pressable
                key={day.id}
                onPress={() => setDayId(day.id)}
                style={[
                  styles.dayChip,
                  dayId === day.id && styles.dayChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.dayChipLabel,
                    dayId === day.id && styles.dayChipLabelActive,
                  ]}
                >
                  {t(locale, "planner.day")} {i + 1}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {visible.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <Text style={styles.entryBody}>{entry.body || "·"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {entry.media.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: resolveMediaUrl(url) }}
                    style={styles.thumb}
                  />
                ))}
              </ScrollView>
            </View>
          ))}
          {visible.length === 0 && (
            <Text style={styles.hint}>{t(locale, "journal.empty")}</Text>
          )}

          <View style={styles.compose}>
            <Text style={styles.composeTitle}>{t(locale, "journal.compose")}</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t(locale, "journal.placeholder")}
              placeholderTextColor={colors.inkSoft}
              multiline
              style={styles.input}
            />
            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={() => void capture()}>
                <Text style={styles.secondaryLabel}>
                  {t(locale, "mobile.capture")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.primary, saving && styles.disabled]}
                disabled={saving}
                onPress={() => void save()}
              >
                <Text style={styles.primaryLabel}>
                  {saving
                    ? t(locale, "journal.saving")
                    : t(locale, "journal.save")}
                </Text>
              </Pressable>
            </View>
            {pendingMedia.length > 0 && (
              <ScrollView horizontal style={{ marginTop: 12 }}>
                {pendingMedia.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: resolveMediaUrl(url) }}
                    style={styles.thumb}
                  />
                ))}
              </ScrollView>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "600",
    color: colors.ink,
  },
  support: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  dayRow: { gap: 8, paddingVertical: 16 },
  dayChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.foam,
    marginRight: 8,
  },
  dayChipActive: {
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  dayChipLabel: { fontSize: 13, color: colors.inkSoft },
  dayChipLabelActive: { color: colors.foam },
  entry: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  entryBody: {
    fontSize: 20,
    lineHeight: 28,
    color: colors.ink,
    marginBottom: 10,
  },
  thumb: {
    width: 72,
    height: 96,
    marginRight: 8,
    backgroundColor: colors.mist,
  },
  hint: { color: colors.inkSoft, fontSize: 15, marginTop: 8 },
  compose: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.foam,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  composeTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 10,
  },
  input: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  primary: {
    flex: 1,
    backgroundColor: colors.timber,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryLabel: { color: colors.foam, fontWeight: "600" },
  secondary: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  secondaryLabel: { color: colors.river, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  error: { marginTop: 10, color: colors.timber, fontSize: 13 },
});
