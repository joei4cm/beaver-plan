"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type {
  ActivityEvent,
  ActivityEventType,
  TripComment,
  TripMember,
  TripRole,
} from "@beaver/core";
import { parseMentions, sampleKyotoCollab } from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";

type Tab = "comments" | "activity";

type MembersPayload = {
  members: TripMember[];
  yourRole: TripRole | null;
};

type CommentsPayload = { comments: TripComment[] };
type ActivityPayload = { events: ActivityEvent[] };

function newLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

export function TripCollabPanel({
  tripId,
  locale,
  selectedStopId,
  selectedStopName,
}: {
  tripId: string;
  locale: Locale;
  selectedStopId: string | null;
  selectedStopName?: string;
}) {
  const [tab, setTab] = useState<Tab>("comments");
  const [members, setMembers] = useState<TripMember[]>([]);
  const [yourRole, setYourRole] = useState<TripRole | null>(null);
  const [comments, setComments] = useState<TripComment[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [body, setBody] = useState("");
  const [scopeStop, setScopeStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(false);
  const [softOffline, setSoftOffline] = useState(false);
  const [liveApi, setLiveApi] = useState(false);

  const canComment = yourRole === "owner" || yourRole === "editor";

  const mentionCandidates = useMemo(() => {
    const names = members
      .map((m) => m.displayName?.trim())
      .filter((n): n is string => Boolean(n));
    const at = body.lastIndexOf("@");
    if (at < 0) return [];
    const partial = body.slice(at + 1);
    if (partial.includes(" ") && !partial.trim()) return [];
    const q = partial.toLowerCase();
    return names.filter((n) => n.toLowerCase().startsWith(q)).slice(0, 5);
  }, [body, members]);

  const applySeed = useCallback(
    (opts?: { soft?: boolean }) => {
      if (tripId !== "sample-kyoto") return false;
      const seed = sampleKyotoCollab();
      setMembers(seed.members);
      setYourRole(seed.yourRole);
      setComments(seed.comments);
      setEvents(seed.events);
      setDemoSeeded(true);
      setSoftOffline(Boolean(opts?.soft));
      setLiveApi(false);
      setError(null);
      return true;
    },
    [tripId],
  );

  const refresh = useCallback(async (): Promise<"live" | "seed"> => {
    const [m, c, a] = await Promise.all([
      apiGet<MembersPayload>(`/v1/trips/${tripId}/members`),
      apiGet<CommentsPayload>(`/v1/trips/${tripId}/comments`),
      apiGet<ActivityPayload>(`/v1/trips/${tripId}/activity?limit=40`),
    ]);
    const emptyLive =
      tripId === "sample-kyoto" &&
      m.members.length === 0 &&
      c.comments.length === 0 &&
      a.events.length === 0;
    if (emptyLive) {
      applySeed();
      return "seed";
    }
    setMembers(m.members);
    setYourRole(m.yourRole);
    setComments(c.comments);
    setEvents(a.events);
    setDemoSeeded(false);
    setSoftOffline(false);
    setLiveApi(true);
    setError(null);
    return "live";
  }, [applySeed, tripId]);

  useEffect(() => {
    let stopped = false;
    let intervalId: number | undefined;
    startTransition(() => {
      void refresh()
        .then((mode) => {
          if (stopped || mode !== "live") return;
          // Poll only while the live API answered — never while seeded/offline.
          intervalId = window.setInterval(() => {
            void refresh()
              .then((next) => {
                if (next !== "live" && intervalId !== undefined) {
                  window.clearInterval(intervalId);
                  intervalId = undefined;
                }
              })
              .catch((e: unknown) => {
                if (isPlannerNoiseError(e)) {
                  if (intervalId !== undefined) {
                    window.clearInterval(intervalId);
                    intervalId = undefined;
                  }
                  applySeed({ soft: true });
                }
              });
          }, 20_000);
        })
        .catch((e: unknown) => {
          if (isPlannerNoiseError(e)) {
            if (!applySeed({ soft: true })) {
              /* non-sample: stay empty quietly */
            }
            return;
          }
          setError(e instanceof Error ? e.message : "load_failed");
        });
    });
    return () => {
      stopped = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [applySeed, refresh]);

  useEffect(() => {
    setMentionOpen(mentionCandidates.length > 0);
  }, [mentionCandidates]);

  function insertMention(name: string) {
    const at = body.lastIndexOf("@");
    if (at < 0) {
      setBody((prev) => `${prev}@${name} `);
    } else {
      setBody(`${body.slice(0, at)}@${name} `);
    }
    setMentionOpen(false);
  }

  async function submitComment() {
    const text = body.trim();
    if (!text || !canComment) return;
    setSending(true);
    setError(null);
    try {
      if (demoSeeded || softOffline || !liveApi) {
        const names = members
          .map((m) => m.displayName?.trim())
          .filter((n): n is string => Boolean(n));
        const me =
          members.find((m) => m.role === "owner") ??
          members[0] ?? {
            id: "local-me",
            tripId,
            userId: "demo-user",
            role: "owner" as const,
            displayName: "Demo Traveler",
            joinedAt: new Date().toISOString(),
          };
        const stamp = new Date().toISOString();
        const stopId =
          scopeStop && selectedStopId ? selectedStopId : undefined;
        const next: TripComment = {
          id: newLocalId("comment-local"),
          tripId,
          stopId,
          authorUserId: me.userId,
          authorDisplayName: me.displayName,
          body: text,
          mentions: parseMentions(text, names),
          createdAt: stamp,
        };
        setComments((prev) => [...prev, next]);
        setEvents((prev) => [
          {
            id: newLocalId("activity-local"),
            tripId,
            type: "comment_added",
            actorUserId: me.userId,
            actorDisplayName: me.displayName,
            summary: `${me.displayName ?? me.userId} left a note`,
            createdAt: stamp,
          },
          ...prev,
        ]);
        setBody("");
        setScopeStop(false);
        setTab("comments");
        return;
      }
      await apiSend(`/v1/trips/${tripId}/comments`, "POST", {
        body: text,
        stopId: scopeStop && selectedStopId ? selectedStopId : undefined,
      });
      setBody("");
      setScopeStop(false);
      await refresh();
      setTab("comments");
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        applySeed({ soft: true });
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : "comment_failed");
    } finally {
      setSending(false);
    }
  }

  const visibleComments = useMemo(() => {
    if (!selectedStopId) return comments;
    return comments.filter((c) => !c.stopId || c.stopId === selectedStopId);
  }, [comments, selectedStopId]);

  const showLoading =
    pending && comments.length === 0 && events.length === 0 && !demoSeeded;

  return (
    <section className="animate-rise border-t border-[color:var(--bp-line)] bg-gradient-to-b from-foam/80 to-transparent">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1 pb-5 pt-8 md:px-0">
        <div className="min-w-0 max-w-xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
            {t(locale, "collab.panel.eyebrow")}
          </p>
          <h2 className="mt-2 font-display text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold tracking-[-0.03em] text-ink">
            {t(locale, "collab.panel.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {t(locale, "collab.panel.support")}
          </p>
        </div>
        <div
          className="flex gap-1 border-b border-[color:var(--bp-line)]"
          role="tablist"
          aria-label={t(locale, "collab.panel.title")}
        >
          {(["comments", "activity"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition ${
                tab === key
                  ? "text-river after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-river"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t(locale, `collab.panel.tab.${key}`)}
            </button>
          ))}
        </div>
      </header>

      {demoSeeded ? (
        <SoftFailNotice className="mb-4">
          {softOffline
            ? t(locale, "collab.panel.softOffline")
            : t(locale, "collab.panel.demoNotice")}
        </SoftFailNotice>
      ) : null}

      {error ? (
        <p className="mb-3 text-sm text-timber" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "comments" ? (
        <div className="animate-sheet-in grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <ul className="max-h-72 space-y-0 overflow-y-auto pr-1">
            {showLoading ? (
              <li className="space-y-3 py-2" aria-busy="true">
                <div className="h-3 w-28 rounded bg-mist" />
                <div className="h-4 w-full max-w-md rounded bg-mist/70" />
                <div className="h-4 w-3/4 max-w-sm rounded bg-mist/50" />
                <p className="pt-2 text-sm text-ink-soft">
                  {t(locale, "collab.panel.loading")}
                </p>
              </li>
            ) : null}
            {!showLoading && visibleComments.length === 0 ? (
              <li className="border-l-2 border-mist py-3 pl-4 text-sm text-ink-soft">
                {t(locale, "collab.panel.emptyComments")}
              </li>
            ) : null}
            {visibleComments.map((c, i) => (
              <li
                key={c.id}
                className="animate-rise border-l-2 border-river/40 py-3 pl-4"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-ink">
                    {c.authorDisplayName ?? c.authorUserId}
                  </span>
                  <time className="text-[11px] text-ink-soft/80">
                    {formatWhen(c.createdAt, locale)}
                  </time>
                  {c.stopId ? (
                    <span className="text-[11px] font-medium text-river">
                      {t(locale, "collab.panel.onStop")}
                      {stopLabel(c.stopId, selectedStopId, selectedStopName)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {renderBody(c.body, c.mentions)}
                </p>
              </li>
            ))}
          </ul>

          <div className="relative border-t border-[color:var(--bp-line)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {canComment ? (
              <div className="space-y-3">
                <label className="sr-only" htmlFor="collab-comment">
                  {t(locale, "collab.panel.compose")}
                </label>
                <textarea
                  id="collab-comment"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder={t(locale, "collab.panel.placeholder")}
                  className="w-full resize-y rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/90 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft/50 focus:border-river focus:ring-2 focus:ring-focus/40"
                />
                {mentionOpen && mentionCandidates.length > 0 ? (
                  <ul className="absolute left-0 z-10 min-w-[12rem] overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-sm lg:left-6">
                    {mentionCandidates.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => insertMention(name)}
                          className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-mist/60 hover:text-river"
                        >
                          @{name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    className={`flex items-center gap-2 text-xs text-ink-soft ${
                      selectedStopId ? "cursor-pointer" : "opacity-40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!selectedStopId}
                      checked={Boolean(scopeStop && selectedStopId)}
                      onChange={(e) => setScopeStop(e.target.checked)}
                      className="accent-[color:var(--bp-river,#2F6BFF)]"
                    />
                    {selectedStopName
                      ? t(locale, "collab.panel.attachStopNamed").replace(
                          "{name}",
                          selectedStopName,
                        )
                      : t(locale, "collab.panel.attachStop")}
                  </label>
                  <button
                    type="button"
                    disabled={sending || !body.trim()}
                    onClick={() => void submitComment()}
                    className="rounded-bp-sm bg-river px-4 py-2 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending
                      ? t(locale, "collab.panel.posting")
                      : t(locale, "collab.panel.post")}
                  </button>
                </div>
                <p className="text-[11px] text-ink-soft/70">
                  {t(locale, "collab.panel.mentionHint")}
                </p>
              </div>
            ) : (
              <p className="border-l-2 border-mist px-3 py-2 text-sm text-ink-soft">
                {yourRole
                  ? t(locale, "collab.panel.viewerReadonly")
                  : showLoading
                    ? t(locale, "collab.panel.loading")
                    : t(locale, "collab.panel.viewerReadonly")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="animate-sheet-in">
          <ol className="relative max-h-80 space-y-0 overflow-y-auto border-l-2 border-river/30 pl-5">
            {showLoading ? (
              <li className="space-y-3 py-1" aria-busy="true">
                <div className="h-3 w-24 rounded bg-mist" />
                <div className="h-4 w-64 max-w-full rounded bg-mist/70" />
                <p className="text-sm text-ink-soft">
                  {t(locale, "collab.panel.loading")}
                </p>
              </li>
            ) : null}
            {!showLoading && events.length === 0 ? (
              <li className="py-2 text-sm text-ink-soft">
                {t(locale, "collab.panel.emptyActivity")}
              </li>
            ) : null}
            {events.map((ev, i) => (
              <li
                key={ev.id}
                className="animate-rise relative pb-5 last:pb-1"
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <span
                  className="absolute -left-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full bg-river ring-[3px] ring-paper"
                  aria-hidden
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-river">
                    {activityLabel(locale, ev.type)}
                  </span>
                  <time className="text-[11px] text-ink-soft/75">
                    {formatWhen(ev.createdAt, locale)}
                  </time>
                </div>
                <p className="mt-1 text-sm leading-snug text-ink">{ev.summary}</p>
              </li>
            ))}
          </ol>
          {liveApi && !demoSeeded ? (
            <button
              type="button"
              onClick={() =>
                void refresh().catch((e: unknown) => {
                  if (isPlannerNoiseError(e)) {
                    applySeed({ soft: true });
                    return;
                  }
                  setError(e instanceof Error ? e.message : "refresh_failed");
                })
              }
              className="mt-4 text-xs font-medium text-ink-soft transition hover:text-river"
            >
              {t(locale, "collab.panel.refresh")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function activityLabel(locale: Locale, type: ActivityEventType): string {
  return t(locale, `collab.activity.${type}`);
}

function formatWhen(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stopLabel(
  stopId: string,
  selectedStopId: string | null,
  selectedStopName?: string,
): string {
  if (selectedStopId === stopId && selectedStopName) {
    return ` · ${selectedStopName}`;
  }
  return "";
}

function renderBody(body: string, mentions: string[]) {
  if (mentions.length === 0) return body;
  const sorted = [...mentions].sort((a, b) => b.length - a.length);
  const parts: Array<string | { mention: string }> = [];
  let rest = body;
  while (rest.length > 0) {
    let hit: { name: string; idx: number } | null = null;
    for (const name of sorted) {
      const idx = rest.indexOf(`@${name}`);
      if (idx >= 0 && (hit === null || idx < hit.idx)) {
        hit = { name, idx };
      }
    }
    if (!hit) {
      parts.push(rest);
      break;
    }
    if (hit.idx > 0) parts.push(rest.slice(0, hit.idx));
    parts.push({ mention: hit.name });
    rest = rest.slice(hit.idx + hit.name.length + 1);
  }
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <span key={i} className="font-semibold text-river">
        @{p.mention}
      </span>
    ),
  );
}
