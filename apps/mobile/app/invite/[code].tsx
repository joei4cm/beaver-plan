import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { acceptInvite, previewInvite } from "../../src/api";

const locale = "zh-CN" as const;

export default function InviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" ? raw : "";
  const router = useRouter();
  const [title, setTitle] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await previewInvite(code);
      setTitle(data.trip.title);
      setRole(data.role);
    } catch (e) {
      setError(e instanceof Error ? e.message : "invite_invalid");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const res = await acceptInvite(code);
      router.replace(`/trips/${res.trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "join_failed");
      setJoining(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "invite.title") }} />
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
        </View>
      )}
      {!loading && (
        <View style={styles.content}>
          <Text style={styles.eyebrow}>Beaver Plan / 海狸旅行</Text>
          <Text style={styles.title}>{t(locale, "invite.title")}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {title ? (
            <>
              <Text style={styles.trip}>{title}</Text>
              <Text style={styles.meta}>
                {t(locale, "invite.asRole")} · {role} · {code.toUpperCase()}
              </Text>
              <Pressable
                style={styles.cta}
                disabled={joining}
                onPress={() => void join()}
              >
                <Text style={styles.ctaLabel}>
                  {joining
                    ? t(locale, "invite.joining")
                    : t(locale, "invite.join")}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 24, gap: 12 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
  },
  title: { fontSize: 28, fontWeight: "600", color: colors.ink },
  trip: { marginTop: 12, fontSize: 22, color: colors.ink, fontWeight: "500" },
  meta: { color: colors.inkSoft, fontSize: 14 },
  error: { color: colors.timber },
  cta: {
    marginTop: 16,
    backgroundColor: colors.river,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaLabel: { color: colors.foam, fontWeight: "600" },
});
