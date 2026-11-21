"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import type { TripInvite, TripMember, TripRole } from "@beaver/core";
import { sampleKyotoCollab } from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";

type MembersPayload = {
  members: TripMember[];
  tripVersion: number;
  yourRole: TripRole | null;
};

type InvitePayload = {
  invite: TripInvite;
  code: string;
  inviteUrl: string;
  path: string;
};

const ROLE_CHIP: Record<TripRole, string> = {
  owner: "bg-river text-foam",
  editor: "bg-river/12 text-river-deep",
  viewer: "bg-mist text-ink-soft",
};

/** Demo / soft presence — role-tinted Lumen azure (not a live CRDT channel). */
type PresenceState = "active" | "idle" | "away";

const PRESENCE_PILL: Record<PresenceState, string> = {
  active: "bg-river/12 text-river-deep",
  idle: "bg-focus/15 text-river-deep",
  away: "bg-mist text-ink-soft",
};

function presenceFor(member: TripMember): PresenceState {
  if (member.role === "owner") return "active";
  if (member.role === "editor") return "idle";
  return "away";
}

export function TripMembersBar({
  tripId,
  locale,
  tripVersion,
  onVersion,
}: {
  tripId: string;
  locale: Locale;
  tripVersion: number;
  onVersion?: (v: number) => void;
}) {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [yourRole, setYourRole] = useState<TripRole | null>(null);
  const [open, setOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [lastInvite, setLastInvite] = useState<InvitePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [demoSeeded, setDemoSeeded] = useState(false);
  const [softOffline, setSoftOffline] = useState(false);

  const applySeed = useCallback(
    (opts?: { soft?: boolean }) => {
      if (tripId !== "sample-kyoto") return false;
      const seed = sampleKyotoCollab();
      setMembers(seed.members);
      setYourRole(seed.yourRole);
      setDemoSeeded(true);
      setSoftOffline(Boolean(opts?.soft));
      setError(null);
      return true;
    },
    [tripId],
  );

  const refresh = useCallback(async () => {
    const data = await apiGet<MembersPayload>(`/v1/trips/${tripId}/members`);
    if (tripId === "sample-kyoto" && data.members.length === 0) {
      applySeed();
      return;
    }
    setMembers(data.members);
    setYourRole(data.yourRole);
    setDemoSeeded(false);
    setSoftOffline(false);
    onVersion?.(data.tripVersion);
  }, [applySeed, tripId, onVersion]);

  useEffect(() => {
    startTransition(() => {
      void refresh().catch((e: unknown) => {
        if (isPlannerNoiseError(e)) {
          if (!applySeed({ soft: true })) return;
          return;
        }
        setError(e instanceof Error ? e.message : "load_failed");
      });
    });
  }, [applySeed, refresh]);

  async function createInvite() {
    setError(null);
    setCopied(false);
    if (demoSeeded) {
      setLastInvite({
        invite: {
          id: "invite-demo",
          tripId,
          code: "BP-DEMO42",
          role: inviteRole,
          createdBy: "demo-user",
          createdAt: new Date().toISOString(),
          useCount: 0,
        },
        code: "BP-DEMO42",
        inviteUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/invite/BP-DEMO42`,
        path: "/invite/BP-DEMO42",
      });
      setOpen(true);
      return;
    }
    try {
      const data = await apiSend<InvitePayload>(
        `/v1/trips/${tripId}/invites`,
        "POST",
        { role: inviteRole },
      );
      setLastInvite(data);
      setOpen(true);
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        applySeed({ soft: true });
        setLastInvite({
          invite: {
            id: "invite-demo",
            tripId,
            code: "BP-DEMO42",
            role: inviteRole,
            createdBy: "demo-user",
            createdAt: new Date().toISOString(),
            useCount: 0,
          },
          code: "BP-DEMO42",
          inviteUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/invite/BP-DEMO42`,
          path: "/invite/BP-DEMO42",
        });
        setOpen(true);
        return;
      }
      setError(e instanceof Error ? e.message : "invite_failed");
    }
  }

  async function copyInvite() {
    if (!lastInvite) return;
    try {
      await navigator.clipboard.writeText(lastInvite.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const canInvite = yourRole === "owner" || yourRole === "editor";
  const visible = members.slice(0, 5);
  const overflow = Math.max(0, members.length - visible.length);
  const softOpen = demoSeeded || softOffline;
  const presenceSoftCopy = softOffline
    ? t(locale, "collab.presenceSoftFail")
    : t(locale, "collab.presenceDemoNotice");
  const inviteSoftCopy = softOffline
    ? t(locale, "collab.inviteSoftFail")
    : t(locale, "collab.inviteDemoNotice");
  const hardError =
    error && !isPlannerNoiseError(new Error(error)) ? error : null;
  const activeCount = members.filter((m) => presenceFor(m) === "active").length;

  return (
    <div className="animate-fade w-full border-y border-[color:var(--bp-line)] bg-foam/40 px-1 py-3.5 md:px-0">
      {/* Presence list chrome — azure rail · mist-track chips · SoftFailNotice · tip-011 */}
      <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
        <header className="relative flex flex-wrap items-center justify-between gap-2 px-4 pt-2.5 pb-1.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
              {t(locale, "collab.presence.eyebrow")}
            </span>
            <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
              {t(locale, "collab.presence.count").replace(
                "{n}",
                String(members.length),
              )}
            </span>
            <span className="text-[11px] leading-snug text-ink-soft/80">
              {t(locale, "collab.presence.support")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {yourRole ? (
              <span
                className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] bp-transition ${ROLE_CHIP[yourRole]}`}
              >
                {t(locale, `collab.role.${yourRole}`)}
              </span>
            ) : null}
            <span className="rounded-bp-xs bg-mist/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-soft">
              v{tripVersion}
            </span>
            {softOpen ? (
              <span className="rounded-bp-xs bg-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft bp-transition">
                {t(locale, "collab.demoBadge")}
              </span>
            ) : members.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep bp-transition">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-river animate-presence-pulse"
                  aria-hidden
                />
                {t(locale, "collab.presence.live")}
                {activeCount > 0 ? (
                  <span className="tabular-nums font-medium normal-case tracking-normal text-river/80">
                    · {activeCount}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2.5">
          <div
            className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-bp-sm bg-mist/50 p-1"
            role="list"
            aria-label={t(locale, "collab.members")}
          >
            {visible.map((m, i) => (
              <PresenceChip
                key={m.id}
                member={m}
                locale={locale}
                presence={presenceFor(m)}
                style={{ animationDelay: `${Math.min(i, 4) * 40}ms` }}
              />
            ))}
            {overflow > 0 ? (
              <span className="inline-flex h-8 shrink-0 items-center rounded-bp-xs bg-foam/80 px-2 text-[11px] font-semibold text-ink-soft">
                +{overflow}
              </span>
            ) : null}
            {pending && members.length === 0 ? (
              <span
                className="inline-flex h-8 items-center gap-1.5 px-1"
                aria-busy="true"
              >
                <span className="relative inline-flex">
                  <span className="h-7 w-7 rounded-full bg-mist" />
                  <span className="bp-presence-dot bp-presence-dot--sm animate-presence-pulse" />
                </span>
                <span className="h-6 w-20 rounded-bp-xs bg-mist/70" />
              </span>
            ) : null}
            {!pending && members.length === 0 ? (
              <span className="px-2 py-1.5 text-sm text-ink-soft">
                {t(locale, "collab.presence.empty")}
              </span>
            ) : null}
          </div>

          {canInvite ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "editor" | "viewer")
                }
                className="rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-2.5 py-1.5 text-xs text-ink-soft outline-none transition duration-bp-fast ease-bp-out focus:border-river focus:ring-2 focus:ring-focus/35"
                aria-label={t(locale, "collab.inviteRole")}
              >
                <option value="editor">{t(locale, "collab.role.editor")}</option>
                <option value="viewer">{t(locale, "collab.role.viewer")}</option>
              </select>
              <button
                type="button"
                onClick={() => void createInvite()}
                className="rounded-bp-sm bg-river px-3.5 py-1.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
              >
                {t(locale, "collab.invite")}
              </button>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="rounded-bp-sm px-3 py-1.5 text-sm text-ink-soft transition duration-bp-fast ease-bp-out hover:bg-mist/60 hover:text-river focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
              >
                {open ? t(locale, "collab.hide") : t(locale, "collab.show")}
              </button>
            </div>
          ) : null}
        </div>

        {/* Closed-bar SoftFailNotice — presence-scoped; rise in/out (#46) */}
        <SoftFailNotice open={softOpen && !open} compact>
          {presenceSoftCopy}
        </SoftFailNotice>
      </div>

      {hardError ? (
        <p className="mt-2 text-sm text-timber" role="alert">
          {hardError}
        </p>
      ) : null}

      <SheetPresence
        open={open}
        className="mt-4 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
        style={{ animationDelay: "40ms" }}
        aria-label={t(locale, "collab.invite")}
      >
        {/* Azure invite chrome — SoftFailNotice under header rail */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
              {t(locale, "collab.inviteEyebrow")}
            </span>
            <span className="text-[11px] font-medium text-ink-soft/80">
              {t(locale, "collab.invite")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {softOpen ? (
              <span className="rounded-bp-xs bg-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft transition duration-bp-fast ease-bp-out">
                {t(locale, "collab.demoBadge")}
              </span>
            ) : null}
            {lastInvite ? (
              <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep">
                {t(locale, `collab.role.${lastInvite.invite.role}`)}
              </span>
            ) : null}
          </div>
        </div>

        <SoftFailNotice open={softOpen} compact>
          {inviteSoftCopy}
        </SoftFailNotice>

        <div className="space-y-4 px-4 py-4">
          {lastInvite ? (
            <div className="space-y-3">
              <div>
                <p className="font-display text-base tracking-tight text-ink">
                  {t(locale, "collab.shareHint")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <code className="rounded-bp-sm bg-river/10 px-3 py-2 font-mono text-sm tracking-wider text-river-deep">
                  {lastInvite.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  className="rounded-bp-sm bg-river px-3.5 py-2 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                >
                  {copied
                    ? t(locale, "collab.copied")
                    : t(locale, "collab.copyLink")}
                </button>
              </div>
              <p className="break-all text-xs leading-relaxed text-ink-soft/80">
                {lastInvite.inviteUrl}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">{t(locale, "collab.shareHint")}</p>
          )}
        </div>

        {/* Presence list sheet — azure rail · mist spine · tip-011 rise */}
        <div className="border-t border-[color:var(--bp-line)]">
          <header className="flex flex-wrap items-center justify-between gap-2 bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "collab.presence.listEyebrow")}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                {t(locale, "collab.presence.count").replace(
                  "{n}",
                  String(members.length),
                )}
              </span>
            </div>
            {members.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-river animate-presence-pulse"
                  aria-hidden
                />
                {t(locale, "collab.presence.live")}
              </span>
            ) : null}
          </header>

          <ul
            className="relative space-y-0.5 px-3 py-3 before:absolute before:bottom-4 before:left-[1.65rem] before:top-4 before:w-px before:bg-mist before:content-['']"
            role="list"
            aria-label={t(locale, "collab.presence.listEyebrow")}
          >
            {members.map((m, i) => {
              const presence = presenceFor(m);
              return (
                <li
                  key={m.id}
                  className="animate-rise relative z-[1] flex items-center justify-between gap-3 rounded-bp-sm px-2 py-2 transition duration-bp-fast ease-bp-out hover:bg-mist/40"
                  style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PresenceAvatar
                      member={m}
                      size="md"
                      presence={presence}
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {m.displayName ?? m.userId}
                      </span>
                      <span
                        className={`mt-0.5 inline-flex rounded-bp-xs px-1.5 py-px text-[10px] font-semibold leading-4 ${PRESENCE_PILL[presence]}`}
                      >
                        {t(locale, `collab.presence.${presence}`)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-bp-xs px-2 py-0.5 text-[11px] font-semibold ${ROLE_CHIP[m.role]}`}
                  >
                    {t(locale, `collab.role.${m.role}`)}
                  </span>
                </li>
              );
            })}
            {pending && members.length === 0 ? (
              <li className="px-2 py-2 text-sm text-ink-soft">
                {t(locale, "collab.loading")}
              </li>
            ) : null}
            {!pending && members.length === 0 ? (
              <li className="animate-fade px-2 py-3 text-sm text-ink-soft">
                {t(locale, "collab.presence.empty")}
              </li>
            ) : null}
          </ul>
        </div>
      </SheetPresence>
    </div>
  );
}

function PresenceChip({
  member,
  locale,
  presence,
  style,
}: {
  member: TripMember;
  locale: Locale;
  presence: PresenceState;
  style?: CSSProperties;
}) {
  const active = presence === "active";
  return (
    <span
      role="listitem"
      title={`${member.displayName ?? member.userId} · ${t(locale, `collab.role.${member.role}`)} · ${t(locale, `collab.presence.${presence}`)}`}
      className={`animate-rise inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-bp-xs py-1 pl-1 pr-2 transition duration-bp-fast ease-bp-out focus-within:ring-2 focus-within:ring-focus/35 ${
        active
          ? "bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
          : "text-ink-soft hover:bg-foam/70 hover:text-river"
      }`}
      style={style}
    >
      <PresenceAvatar member={member} size="sm" presence={presence} />
      <span className="min-w-0 truncate text-xs font-semibold">
        {shortName(member)}
      </span>
      <span
        className={`shrink-0 rounded-bp-xs px-1.5 py-px text-[10px] font-semibold leading-4 ${ROLE_CHIP[member.role]}`}
      >
        {t(locale, `collab.role.${member.role}`)}
      </span>
    </span>
  );
}

function PresenceAvatar({
  member,
  size,
  presence,
}: {
  member: TripMember;
  size: "sm" | "md";
  presence: PresenceState;
}) {
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[11px]";
  const tone =
    member.role === "owner"
      ? "bg-river text-foam"
      : member.role === "editor"
        ? "bg-river/85 text-foam"
        : "bg-ink-soft/80 text-foam";
  const dotSize = size === "sm" ? "bp-presence-dot--sm" : "";
  const dotTone =
    presence === "active"
      ? "animate-presence-pulse"
      : presence === "idle"
        ? "bp-presence-dot--idle"
        : "bp-presence-dot--away";
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dim} ${tone}`}
      aria-hidden
    >
      {initials(member)}
      <span className={`bp-presence-dot ${dotSize} ${dotTone}`} />
    </span>
  );
}

function shortName(m: TripMember): string {
  const label = (m.displayName ?? m.userId).trim();
  const parts = label.split(/\s+/);
  if (parts.length >= 2) return parts[0]!;
  return label.length > 10 ? `${label.slice(0, 9)}…` : label;
}

function initials(m: TripMember): string {
  const label = (m.displayName ?? m.userId).trim();
  const parts = label.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || "?";
}
