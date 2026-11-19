"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type {
  ActivityEvent,
  ActivityEventType,
  TripComment,
  TripMember,
  TripRole,
} from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";

type Tab = "comments" | "activity";

type MembersPayload = {
  members: TripMember[];
  yourRole: TripRole | null;
};

type CommentsPayload = { comments: TripComment[] };
type ActivityPayload = { events: ActivityEvent[] };

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

  const refresh = useCallback(async () => {
    const [m, c, a] = await Promise.all([
      apiGet<MembersPayload>(`/v1/trips/${tripId}/members`),
      apiGet<CommentsPayload>(`/v1/trips/${tripId}/comments`),
      apiGet<ActivityPayload>(`/v1/trips/${tripId}/activity?limit=40`),
    ]);
    setMembers(m.members);
    setYourRole(m.yourRole);
    setComments(c.comments);
    setEvents(a.events);
  }, [tripId]);

  useEffect(() => {
    let stopped = false;
    let intervalId: number | undefined;
    startTransition(() => {
      void refresh()
        .then(() => {
          if (stopped) return;
          // Only poll when Neon/API is healthy — avoid 503 console spam on demo shell.
          intervalId = window.setInterval(() => {
            void refresh().catch(() => undefined);
          }, 20_000);
        })
        .catch((e: Error) => {
          if (/503/.test(e.message) || /Failed to fetch/i.test(e.message)) {
            return;
          }
          setError(e.message);
        });
    });
    return () => {
      stopped = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [refresh]);

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
      await apiSend(`/v1/trips/${tripId}/comments`, "POST", {
        body: text,
        stopId: scopeStop && selectedStopId ? selectedStopId : undefined,
      });
      setBody("");
      setScopeStop(false);
      await refresh();
      setTab("comments");
    } catch (e) {
      setError(e instanceof Error ? e.message : "comment_failed");
    } finally {
      setSending(false);
    }
  }

  const visibleComments = useMemo(() => {
    if (!selectedStopId) return comments;
    // Show trip-level + selected-stop threads when a stop is focused.
    return comments.filter((c) => !c.stopId || c.stopId === selectedStopId);
  }, [comments, selectedStopId]);

  return (
    <section className="animate-fade overflow-hidden rounded-md border border-[color:var(--bp-line)] bg-foam/55 backdrop-blur-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-river/80">
            {t(locale, "collab.panel.eyebrow")}
          </p>
          <h2 className="mt-1 font-display text-xl tracking-tight text-ink">
            {t(locale, "collab.panel.title")}
          </h2>
          <p className="mt-1 max-w-md text-sm text-ink-soft">
            {t(locale, "collab.panel.support")}
          </p>
        </div>
        <div className="flex rounded-md border border-[color:var(--bp-line)] bg-paper/60 p-1">
          {(["comments", "activity"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded px-3 py-1.5 text-sm transition ${
                tab === key
                  ? "bg-river text-foam"
                  : "text-ink-soft hover:text-river"
              }`}
            >
              {t(locale, `collab.panel.tab.${key}`)}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p className="px-4 pb-2 text-sm text-timber">{error}</p>
      )}

      {tab === "comments" ? (
        <div className="space-y-4 border-t border-[color:var(--bp-line)] px-4 py-4">
          <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {visibleComments.length === 0 && (
              <li className="text-sm text-ink-soft">
                {pending
                  ? t(locale, "collab.panel.loading")
                  : t(locale, "collab.panel.emptyComments")}
              </li>
            )}
            {visibleComments.map((c) => (
              <li
                key={c.id}
                className="animate-rise border-l-2 border-river/35 pl-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-ink">
                    {c.authorDisplayName ?? c.authorUserId}
                  </span>
                  <time className="text-[11px] text-ink-soft/80">
                    {formatWhen(c.createdAt, locale)}
                  </time>
                  {c.stopId && (
                    <span className="text-[11px] text-river">
                      {t(locale, "collab.panel.onStop")}
                      {stopLabel(c.stopId, selectedStopId, selectedStopName)}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {renderBody(c.body, c.mentions)}
                </p>
              </li>
            ))}
          </ul>

          {canComment ? (
            <div className="relative space-y-2">
              <label className="sr-only" htmlFor="collab-comment">
                {t(locale, "collab.panel.compose")}
              </label>
              <textarea
                id="collab-comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder={t(locale, "collab.panel.placeholder")}
                className="w-full resize-y rounded-md border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 focus:ring-2"
              />
              {mentionOpen && mentionCandidates.length > 0 && (
                <ul className="absolute bottom-[calc(100%-0.5rem)] left-0 z-10 min-w-[12rem] overflow-hidden rounded-md border border-[color:var(--bp-line)] bg-foam shadow-md">
                  {mentionCandidates.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => insertMention(name)}
                        className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-mist/50"
                      >
                        @{name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
                    className="accent-[color:var(--bp-river,#1f6b5c)]"
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
                  className="rounded-md bg-river px-4 py-2 text-sm font-medium text-foam transition hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
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
            <p className="rounded-md bg-mist/40 px-3 py-2 text-sm text-ink-soft">
              {t(locale, "collab.panel.viewerReadonly")}
            </p>
          )}
        </div>
      ) : (
        <div className="border-t border-[color:var(--bp-line)] px-4 py-4">
          <ol className="relative max-h-80 space-y-0 overflow-y-auto border-l border-river/25 pl-4">
            {events.length === 0 && (
              <li className="text-sm text-ink-soft">
                {pending
                  ? t(locale, "collab.panel.loading")
                  : t(locale, "collab.panel.emptyActivity")}
              </li>
            )}
            {events.map((ev) => (
              <li key={ev.id} className="relative pb-4 last:pb-0">
                <span
                  className="absolute -left-[1.28rem] top-1.5 h-2.5 w-2.5 rounded-full bg-river ring-2 ring-foam"
                  aria-hidden
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-river/85">
                    {activityLabel(locale, ev.type)}
                  </span>
                  <time className="text-[11px] text-ink-soft/75">
                    {formatWhen(ev.createdAt, locale)}
                  </time>
                </div>
                <p className="mt-0.5 text-sm text-ink">{ev.summary}</p>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => void refresh().catch((e: Error) => setError(e.message))}
            className="mt-3 text-xs text-ink-soft transition hover:text-river"
          >
            {t(locale, "collab.panel.refresh")}
          </button>
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
      <span key={i} className="font-medium text-river-deep">
        @{p.mention}
      </span>
    ),
  );
}
