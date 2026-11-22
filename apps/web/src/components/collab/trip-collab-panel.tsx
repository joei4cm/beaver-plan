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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
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

/**
 * Collab comments + activity timeline. SoftFail depth kept (BEA-392 / BEA-420 /
 * yield #281) + wave 50–55 craft (#347 / #352 / #378) + wave 59 thread residual
 * (BEA-565): list loading rise/`/80` · empty/author snug · row out-strong.
 * Wave 69 panel brand eyebrow (BEA-721): `0.28em` → `0.26em` twin of trip
 * header brand (#375). Wave 70 panel page H2 (BEA-737): `leading-snug` twin of
 * invite-accept / create-trip page titles · nested empty/author already snug.
 * Compose (#378) + SoftFailBadge · SoftFailSupport · SoftFailNotice mist band
 * unchanged. Craft: `/trips/…?timelineSoftFail=1`. Panel SoftFail yields on
 * Activity; invite SoftFail yields timeline (no double depth). Soft copy never
 * timber / Failed to fetch. No `/dev` gallery. Invite / presence leave-alone.
 */
export function TripCollabPanel({
  tripId,
  locale,
  selectedStopId,
  selectedStopName,
  inviteOpen = false,
}: {
  tripId: string;
  locale: Locale;
  selectedStopId: string | null;
  selectedStopName?: string;
  /** SoftFail yield (BEA-379): panel/timeline SoftFail yield while invite owns. */
  inviteOpen?: boolean;
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
  /** Craft preview: /trips/…?timelineSoftFail=1 — SoftFail depth under Timeline. */
  const [timelineSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("timelineSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });

  /** Craft SoftFail: `?timelineSoftFail=1` opens Activity tab SoftFail depth. */
  useEffect(() => {
    if (timelineSoftPreview) setTab("activity");
  }, [timelineSoftPreview]);

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
  /**
   * Timeline SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
   * parity (BEA-420): SoftFailBadge · SoftFailSupport · mist SoftFail band ·
   * tip-011 mist-wash track. Craft: /trips/…?timelineSoftFail=1. Panel SoftFail
   * yields on Activity; invite SoftFail owns when invite sheet open — timeline
   * SoftFail yields (no double depth). Soft copy never timber / Failed to fetch.
   */
  const softNoticeOpen = demoSeeded || softOffline || timelineSoftPreview;
  const timelineSoftOpen =
    softNoticeOpen && tab === "activity" && !inviteOpen;
  const panelSoftOpen =
    softNoticeOpen && tab !== "activity" && !inviteOpen;
  const softNoticeCopy = softOffline
    ? t(locale, "collab.panel.softOffline")
    : t(locale, "collab.panel.demoNotice");
  const timelineSoftCopy =
    softOffline || timelineSoftPreview
      ? t(locale, "collab.panel.timelineSoftFail")
      : t(locale, "collab.panel.timelineDemoNotice");
  const timelineSupportCopy = timelineSoftOpen
    ? t(locale, "collab.panel.timelineSoftSupport")
    : t(locale, "collab.panel.timelineSupport");
  const threadCount = t(locale, "collab.panel.count").replace(
    "{n}",
    String(visibleComments.length),
  );
  const timelineCount = t(locale, "collab.panel.count").replace(
    "{n}",
    String(events.length),
  );

  return (
    <section className="animate-rise border-t border-[color:var(--bp-line)] bg-gradient-to-b from-foam/80 to-transparent">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1 pb-5 pt-8 md:px-0">
        <div className="min-w-0 max-w-xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.26em] text-river">
            {t(locale, "collab.panel.eyebrow")}
          </p>
          <h2 className="mt-2 font-display text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold leading-snug tracking-[-0.03em] text-ink">
            {t(locale, "collab.panel.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {t(locale, "collab.panel.support")}
          </p>
        </div>
        {/*
          Web motion residual (BEA-772 / wave 72): tab color settle
          ease-bp-out → ease-bp-out-strong — tip-011 twin of `.bp-day-tab`
          color out-strong. SoftFail / prefer LIVE / comments·timeline
          reopen untouched. Indicator keep ease-bp-out (mount-only).
        */}
        <div
          className="flex gap-1 border-b border-[color:var(--bp-line)]"
          role="tablist"
          aria-label={t(locale, "collab.panel.title")}
        >
          {(["comments", "activity"] as const).map((key) => {
            const on = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`collab-tab-${key}`}
                aria-selected={on}
                aria-controls={`collab-panel-${key}`}
                onClick={() => setTab(key)}
                className={`relative -mb-px px-3.5 pb-2.5 pt-1 text-sm font-medium transition duration-bp-fast ease-bp-out-strong ${
                  on
                    ? "text-river"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {t(locale, `collab.panel.tab.${key}`)}
                {on ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-river transition duration-bp ease-bp-out"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      {/* Panel SoftFail — Comments tab; yields when Timeline SoftFail owns Activity, or invite SoftFail owns (BEA-379). */}
      <SoftFailNotice open={panelSoftOpen} className="mb-4">
        {softNoticeCopy}
      </SoftFailNotice>

      {error ? (
        <p className="mb-3 text-sm text-ink-soft" role="alert">
          {error}
        </p>
      ) : null}

      {/* Tab sheets share one cell so SheetPresence in/out (#46) doesn’t stack. */}
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
      {/*
        Comments thread SoftFail depth kept (panel SoftFailNotice + Demo/Live) +
        wave 50 thread craft (BEA-487 / #352) + wave 55 compose (BEA-528 / #378) +
        wave 59 thread residual (BEA-565): loading rise/`/80` · empty/author snug ·
        row out-strong. SoftFail reopen out of scope. No `/dev` gallery.
      */}
      <SheetPresence
        open={tab === "comments"}
        id="collab-panel-comments"
        role="tabpanel"
        aria-label={t(locale, "collab.panel.tab.comments")}
        className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
        style={{ animationDelay: "40ms" }}
      >
        <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
          <div className="min-w-0">
            <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                  {t(locale, "collab.panel.threadEyebrow")}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                  {threadCount}
                </span>
              </div>
              {panelSoftOpen ? (
                <SoftFailBadge>{t(locale, "collab.demoBadge")}</SoftFailBadge>
              ) : (
                <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "collab.panel.liveBadge")}
                </SoftFailLiveBadge>
              )}
            </header>

            {/*
              Thread list residual (BEA-565 beyond reply #378): loading rise/`/80`
              · empty/author leading-snug · row ease-bp-out-strong. SoftFail /
              compose chrome untouched.
            */}
            <ul className="max-h-72 space-y-0 overflow-y-auto px-3 py-2">
              {showLoading ? (
                <li
                  className="animate-rise space-y-3 px-1 py-3"
                  style={{ animationDelay: "40ms" }}
                  aria-busy="true"
                >
                  <div className="h-3 w-28 rounded-bp-xs bg-mist" />
                  <div className="h-4 w-full max-w-md rounded-bp-xs bg-mist/70" />
                  <div className="h-4 w-3/4 max-w-sm rounded-bp-xs bg-mist/50" />
                  <p className="pt-1 text-sm leading-snug text-ink-soft/80">
                    {t(locale, "collab.panel.loading")}
                  </p>
                </li>
              ) : null}
              {!showLoading && visibleComments.length === 0 ? (
                <li
                  className="animate-rise list-none px-1 py-5"
                  style={{ animationDelay: "40ms" }}
                  role="status"
                  aria-live="polite"
                >
                  <p className="font-display text-base font-semibold leading-snug tracking-tight text-ink">
                    {t(locale, "collab.panel.emptyComments")}
                  </p>
                </li>
              ) : null}
              {visibleComments.map((c, i) => (
                <li
                  key={c.id}
                  className="animate-rise group relative border-l-2 border-river/40 py-3.5 pl-4 transition duration-bp-fast ease-bp-out-strong hover:border-river hover:bg-mist/35"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-river/90 text-[10px] font-semibold text-foam shadow-[0_0_0_3px_rgba(47,107,255,0.12)]"
                      aria-hidden
                    >
                      {commentInitials(c.authorDisplayName ?? c.authorUserId)}
                    </span>
                    <span className="text-sm font-semibold leading-snug tracking-tight text-ink">
                      {c.authorDisplayName ?? c.authorUserId}
                    </span>
                    <time className="text-[11px] tabular-nums text-ink-soft/80">
                      {formatWhen(c.createdAt, locale)}
                    </time>
                    {c.stopId ? (
                      <span className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[11px] font-medium text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                        {t(locale, "collab.panel.onStop")}
                        {stopLabel(c.stopId, selectedStopId, selectedStopName)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap pl-8 text-sm leading-relaxed text-ink-soft">
                    {renderBody(c.body, c.mentions)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/*
            Reply compose residual (BEA-528 beyond thread #352): journal compose
            chrome bar — azure inset · paper/70 · paper/55 aside · field rise ·
            mention tip-011. SoftFail untouched. No Expo composer / `/dev`.
          */}
          <div className="relative border-t border-[color:var(--bp-line)] bg-paper/55 lg:border-l lg:border-t-0">
            <header className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "collab.panel.composeEyebrow")}
              </span>
            </header>
            <div className="relative px-4 py-4">
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
                    className="animate-rise w-full resize-y rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft/50 transition duration-bp-fast ease-bp-out focus:border-river focus:ring-2 focus:ring-focus/45"
                    style={{ animationDelay: "40ms" }}
                  />
                  {mentionOpen && mentionCandidates.length > 0 ? (
                    <ul className="absolute left-4 z-10 min-w-[12rem] overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
                      {mentionCandidates.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            onClick={() => insertMention(name)}
                            className="block w-full px-3 py-2 text-left text-sm text-ink transition duration-bp-fast ease-bp-out hover:bg-mist/60 hover:text-river active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                          >
                            @{name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div
                    className="animate-rise flex flex-wrap items-center justify-between gap-2"
                    style={{ animationDelay: "80ms" }}
                  >
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
                      className="rounded-bp-sm bg-river px-4 py-2 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sending
                        ? t(locale, "collab.panel.posting")
                        : t(locale, "collab.panel.post")}
                    </button>
                  </div>
                  <p
                    className="animate-rise text-[11px] leading-relaxed text-ink-soft/70"
                    style={{ animationDelay: "120ms" }}
                  >
                    {t(locale, "collab.panel.mentionHint")}
                  </p>
                </div>
              ) : (
                <p
                  className="animate-rise rounded-bp-sm border border-dashed border-[color:var(--bp-line)] bg-mist/40 px-3 py-3 text-sm leading-relaxed text-ink-soft"
                  style={{ animationDelay: "40ms" }}
                >
                  {yourRole
                    ? t(locale, "collab.panel.viewerReadonly")
                    : showLoading
                      ? t(locale, "collab.panel.loading")
                      : t(locale, "collab.panel.viewerReadonly")}
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetPresence>

      {/*
        Timeline SoftFail depth kept (BEA-392 / BEA-420 / yield #281) + wave 50
        craft (#347 / BEA-479) + wave 55 residual (BEA-532) + wave 60 residual
        (BEA-575 beyond #377) + wave 62 residual (BEA-603 beyond #407): Now/type
        leading-4 · actor snug. SoftFailBadge · SoftFailSupport ·
        softFailMistWashClass unchanged. Invite SoftFail owns when open. Craft:
        ?timelineSoftFail=1 — never timber / Failed to fetch. No `/dev` gallery.
      */}
      <SheetPresence
        open={tab === "activity"}
        id="collab-panel-activity"
        role="tabpanel"
        aria-label={t(locale, "collab.panel.tab.activity")}
        className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
        style={{ animationDelay: "40ms" }}
      >
        <header className="relative border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "collab.panel.timelineEyebrow")}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                {timelineCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {timelineSoftOpen ? (
                <SoftFailBadge>
                  {t(locale, "collab.panel.timelineSoftBadge")}
                </SoftFailBadge>
              ) : (
                <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "collab.panel.liveBadge")}
                </SoftFailLiveBadge>
              )}
              {liveApi && !demoSeeded ? (
                <button
                  type="button"
                  onClick={() =>
                    void refresh().catch((e: unknown) => {
                      if (isPlannerNoiseError(e)) {
                        applySeed({ soft: true });
                        return;
                      }
                      setError(
                        e instanceof Error ? e.message : "refresh_failed",
                      );
                    })
                  }
                  className="animate-rise text-[11px] font-medium text-ink-soft/80 transition duration-bp-fast ease-bp-out-strong hover:text-river active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                  style={{ animationDelay: "55ms" }}
                >
                  {t(locale, "collab.panel.refresh")}
                </button>
              ) : null}
            </div>
          </div>
          {timelineSoftOpen ? (
            <SoftFailSupport className="mt-1.5 block max-w-lg animate-rise [animation-delay:40ms]">
              {timelineSupportCopy}
            </SoftFailSupport>
          ) : (
            <p
              className="animate-rise mt-1.5 max-w-lg text-xs leading-relaxed text-ink-soft/80"
              style={{ animationDelay: "40ms" }}
            >
              {timelineSupportCopy}
            </p>
          )}
        </header>

        {/* Compact SoftFail mist band under azure Timeline rail — never timber / Failed to fetch. */}
        <SoftFailNotice open={timelineSoftOpen} compact>
          {timelineSoftCopy}
        </SoftFailNotice>

        <ol
          className={`bp-collab-timeline m-0 max-h-80 list-none space-y-0 overflow-y-auto px-4 py-4 pl-5 ${softFailMistWashClass}`}
        >
          {/* Mist track — tip-011 wash spine behind azure nodes */}
          <span aria-hidden className="bp-collab-timeline__track" />
          {showLoading ? (
            <li
              className="animate-rise bp-collab-timeline__item space-y-3 py-1"
              style={{ animationDelay: "70ms" }}
              aria-busy="true"
            >
              <div className="h-3 w-24 rounded-bp-xs bg-mist" />
              <div className="h-4 w-64 max-w-full rounded-bp-xs bg-mist/70" />
              <p className="text-sm leading-snug text-ink-soft/80">
                {t(locale, "collab.panel.loading")}
              </p>
            </li>
          ) : null}
          {!showLoading && events.length === 0 ? (
            <li
              className="animate-rise bp-collab-timeline__item space-y-1.5 py-3"
              style={{ animationDelay: "70ms" }}
            >
              <p className="font-display text-sm font-semibold leading-snug tracking-tight text-ink">
                {t(locale, "collab.panel.emptyActivity")}
              </p>
              <p className="text-xs leading-relaxed text-ink-soft/80">
                {t(locale, "collab.panel.emptyActivityHint")}
              </p>
            </li>
          ) : null}
          {events.map((ev, i) => (
            <li
              key={ev.id}
              className="animate-rise bp-collab-timeline__item"
              style={{ animationDelay: `${Math.min(i, 8) * 35 + 70}ms` }}
            >
              <span
                className={`bp-collab-timeline__node${
                  i === 0 ? " bp-collab-timeline__node--head" : ""
                }`}
                aria-hidden
                title={ev.actorDisplayName ?? undefined}
              >
                {commentInitials(
                  ev.actorDisplayName ??
                    ev.actorUserId ??
                    activityLabel(locale, ev.type),
                )}
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {i === 0 ? (
                  <span className="rounded-bp-xs bg-river/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase leading-4 tracking-[0.14em] text-river shadow-[inset_2px_0_0_var(--bp-river)]">
                    {t(locale, "collab.panel.timelineNow")}
                  </span>
                ) : null}
                <span className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase leading-4 tracking-[0.14em] text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                  {activityLabel(locale, ev.type)}
                </span>
                {ev.actorDisplayName ? (
                  <span className="text-[11px] font-medium leading-snug text-ink-soft/80">
                    {ev.actorDisplayName}
                  </span>
                ) : null}
                <time className="text-[11px] tabular-nums tracking-wide text-ink-soft/70">
                  {formatWhen(ev.createdAt, locale)}
                </time>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-snug tracking-tight text-ink">
                {ev.summary}
              </p>
            </li>
          ))}
        </ol>
      </SheetPresence>
      </div>
    </section>
  );
}

function activityLabel(locale: Locale, type: ActivityEventType): string {
  return t(locale, `collab.activity.${type}`);
}

function commentInitials(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || "?";
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
