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

  return (
    <div className="animate-fade w-full border-y border-[color:var(--bp-line)] bg-foam/40 px-1 py-3.5 md:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-river">
            {t(locale, "collab.members")}
          </span>

          <div
            className="flex flex-wrap items-center gap-1.5"
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
              <span className="inline-flex h-8 items-center rounded-bp-xs bg-mist px-2 text-[11px] font-semibold text-ink-soft">
                +{overflow}
              </span>
            ) : null}
            {pending && members.length === 0 ? (
              <span className="inline-flex h-8 items-center gap-1.5" aria-busy="true">
                <span className="relative inline-flex">
                  <span className="h-7 w-7 rounded-full bg-mist" />
                  <span className="bp-presence-dot bp-presence-dot--sm animate-presence-pulse" />
                </span>
                <span className="h-6 w-20 rounded-bp-xs bg-mist/70" />
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            <span className="rounded-bp-xs bg-mist/80 px-2 py-0.5 font-medium tabular-nums">
              v{tripVersion}
            </span>
            {yourRole ? (
              <span
                className={`rounded-bp-xs px-2 py-0.5 text-[11px] font-semibold ${ROLE_CHIP[yourRole]}`}
              >
                {t(locale, `collab.role.${yourRole}`)}
              </span>
            ) : null}
            {demoSeeded ? (
              <span className="rounded-bp-xs bg-river/12 px-2 py-0.5 text-[11px] font-semibold text-river-deep">
                {t(locale, "collab.demoBadge")}
              </span>
            ) : null}
            {members.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-bp-xs bg-river/10 px-2 py-0.5 text-[11px] font-medium text-river-deep">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-river animate-presence-pulse"
                  aria-hidden
                />
                {t(locale, "collab.presence.live")}
              </span>
            ) : null}
          </div>
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
              className="rounded-bp-sm bg-river px-3.5 py-1.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out hover:bg-river-deep"
            >
              {t(locale, "collab.invite")}
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-bp-sm px-3 py-1.5 text-sm text-ink-soft transition duration-bp-fast ease-bp-out hover:bg-mist/60 hover:text-river"
            >
              {open ? t(locale, "collab.hide") : t(locale, "collab.show")}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-timber" role="alert">
          {error}
        </p>
      ) : null}

      <SoftFailNotice
        open={(demoSeeded || softOffline) && !open}
        className="mt-3"
      >
        {softOffline
          ? t(locale, "collab.panel.softOffline")
          : t(locale, "collab.panel.demoNotice")}
      </SoftFailNotice>

      <SheetPresence
        open={open}
        className="mt-4 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
        style={{ animationDelay: "40ms" }}
        aria-label={t(locale, "collab.invite")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {t(locale, "collab.invite")}
          </span>
          {lastInvite ? (
            <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep">
              {t(locale, `collab.role.${lastInvite.invite.role}`)}
            </span>
          ) : null}
        </div>

        <div className="space-y-4 px-4 py-4">
          <SoftFailNotice open={demoSeeded || softOffline}>
            {softOffline
              ? t(locale, "collab.panel.softOffline")
              : t(locale, "collab.panel.demoNotice")}
          </SoftFailNotice>

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
                  className="rounded-bp-sm bg-river px-3.5 py-2 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out hover:bg-river-deep"
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

          <ul
            className="space-y-1 border-t border-[color:var(--bp-line)] pt-3"
            role="list"
          >
            {members.map((m, i) => (
              <li
                key={m.id}
                className="animate-rise flex items-center justify-between gap-3 rounded-bp-sm px-1 py-1.5 transition duration-bp-fast ease-bp-out hover:bg-mist/40"
                style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <PresenceAvatar
                    member={m}
                    size="md"
                    presence={presenceFor(m)}
                  />
                  <span className="truncate text-sm font-medium text-ink">
                    {m.displayName ?? m.userId}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-bp-xs px-2 py-0.5 text-[11px] font-semibold ${ROLE_CHIP[m.role]}`}
                >
                  {t(locale, `collab.role.${m.role}`)}
                </span>
              </li>
            ))}
            {pending && members.length === 0 ? (
              <li className="text-sm text-ink-soft">
                {t(locale, "collab.loading")}
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
      className={`animate-rise inline-flex max-w-[11rem] items-center gap-1.5 rounded-bp border bg-foam py-0.5 pl-0.5 pr-2 shadow-bp-soft transition duration-bp-fast ease-bp-out hover:border-river/40 ${
        active
          ? "border-river/35 ring-1 ring-river/15"
          : "border-[color:var(--bp-line)]"
      }`}
      style={style}
    >
      <PresenceAvatar member={member} size="sm" presence={presence} />
      <span className="min-w-0 truncate text-xs font-semibold text-ink">
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
