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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailLiveBadgeClass,
  softFailMistWashClass,
} from "@/components/soft-fail-notice";
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

/** Status pills — wave 51 (BEA-493) + wave 57 residual (BEA-546): away inset. */
const PRESENCE_PILL: Record<PresenceState, string> = {
  active:
    "bg-river/12 text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]",
  idle: "bg-focus/15 text-river-deep shadow-[inset_2px_0_0_var(--bp-focus)]",
  away: "bg-mist text-ink-soft shadow-[inset_2px_0_0_color-mix(in_srgb,var(--bp-ink-soft)_55%,transparent)]",
};

function presenceFor(member: TripMember): PresenceState {
  if (member.role === "owner") return "active";
  if (member.role === "editor") return "idle";
  return "away";
}

/**
 * Presence + invite sheets — SoftFail depth kept (BEA-392 / BEA-420 / yield
 * #281) + wave 48 invite/presence residual (BEA-461) + wave 51 presence pills
 * (BEA-493) + wave 53 invite residual (BEA-506) + wave 54 members roster
 * (BEA-518) + wave 56 invite residual (BEA-543) + wave 57 presence pills
 * (BEA-546): away pill inset · strip empty `/80` · status pill out-strong +
 * wave 57 members invite residual (BEA-547): invite sheet eyebrow + role chip
 * `0.65rem` (roster parity) · role select hover river. SoftFailBadge ·
 * SoftFailSupport · mist band unchanged. Invite SoftFail yields presence (no
 * double depth). Soft copy never timber / Failed to fetch. No `/dev` gallery.
 */
export function TripMembersBar({
  tripId,
  locale,
  tripVersion,
  onVersion,
  onInviteOpenChange,
}: {
  tripId: string;
  locale: Locale;
  tripVersion: number;
  onVersion?: (v: number) => void;
  /** SoftFail yield (BEA-379): timeline/panel SoftFail yield while invite owns. */
  onInviteOpenChange?: (open: boolean) => void;
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
  /** Craft preview: /trips/…?presenceSoftFail=1 — SoftFail depth under Presence. */
  const [presenceSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("presenceSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?inviteSoftFail=1 — SoftFail depth under Invite. */
  const [inviteSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("inviteSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    onInviteOpenChange?.(open);
  }, [open, onInviteOpenChange]);

  /** Craft SoftFail: `?inviteSoftFail=1` opens invite sheet with demo code. */
  useEffect(() => {
    if (!inviteSoftPreview) return;
    setLastInvite((prev) =>
      prev ?? {
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
      },
    );
    setOpen(true);
  }, [inviteSoftPreview, tripId, inviteRole]);

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
  /**
   * Presence SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
   * parity (BEA-420): SoftFailBadge · SoftFailSupport · mist SoftFail band ·
   * tip-011 mist-wash chips. Craft: /trips/…?presenceSoftFail=1. Invite sheet
   * open → SoftFail chrome yields (no double depth). Soft copy never timber /
   * Failed to fetch.
   */
  const presenceSoftOpen =
    (demoSeeded || softOffline || presenceSoftPreview) && !open;
  const presenceSoftCopy =
    softOffline || presenceSoftPreview
      ? t(locale, "collab.presenceSoftFail")
      : t(locale, "collab.presenceDemoNotice");
  /**
   * Invite SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
   * parity (BEA-420): SoftFailBadge · SoftFailSupport · compact SoftFail under
   * azure rail · mist-wash tip-011. Craft: /trips/…?inviteSoftFail=1. Presence
   * SoftFail yields while invite open. Soft copy never timber / Failed to fetch.
   */
  const inviteSoftOpen =
    (demoSeeded || softOffline || inviteSoftPreview) && open;
  const inviteSoftCopy =
    softOffline || inviteSoftPreview
      ? t(locale, "collab.inviteSoftFail")
      : t(locale, "collab.inviteDemoNotice");
  const hardError =
    error && !isPlannerNoiseError(new Error(error)) ? error : null;
  const activeCount = members.filter((m) => presenceFor(m) === "active").length;

  return (
    <div className="animate-fade w-full border-y border-[color:var(--bp-line)] bg-foam/40 px-1 py-3.5 md:px-0">
      {/*
        Presence SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
        parity (BEA-420): SoftFailBadge · SoftFailSupport · softFailMistWashClass ·
        compact SoftFailNotice. Craft: ?presenceSoftFail=1 — never timber.
      */}
      <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
        <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
              {t(locale, "collab.presence.eyebrow")}
            </span>
            <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
              {t(locale, "collab.presence.count").replace(
                "{n}",
                String(members.length),
              )}
            </span>
            {presenceSoftOpen ? (
              <SoftFailSupport>
                {t(locale, "collab.presence.softSupport")}
              </SoftFailSupport>
            ) : (
              <span className="text-[11px] leading-snug text-ink-soft/80">
                {t(locale, "collab.presence.support")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {yourRole ? (
              <span
                className={`rounded-bp-xs px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] bp-transition ${ROLE_CHIP[yourRole]}`}
              >
                {t(locale, `collab.role.${yourRole}`)}
              </span>
            ) : null}
            <span className="rounded-bp-xs bg-mist/80 px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums text-ink-soft">
              v{tripVersion}
            </span>
            {presenceSoftOpen ? (
              <SoftFailBadge>
                {t(locale, "collab.presence.softBadge")}
              </SoftFailBadge>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 transition duration-bp-fast ease-bp-out ${
                  members.length > 0
                    ? softFailLiveBadgeClass
                    : "rounded-bp-xs bg-mist/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft/70"
                }`}
              >
                {members.length > 0 ? (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-river animate-presence-pulse"
                    aria-hidden
                  />
                ) : null}
                {t(locale, "collab.presence.live")}
                {activeCount > 0 ? (
                  <span className="tabular-nums font-medium normal-case tracking-normal text-river/80">
                    · {activeCount}
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </header>

        {/* Compact SoftFail under azure rail — never timber / Failed to fetch. */}
        <SoftFailNotice open={presenceSoftOpen} compact>
          {presenceSoftCopy}
        </SoftFailNotice>

        <SheetPresence
          open
          className={`flex flex-wrap items-center justify-between gap-3 px-4 pb-2.5 pt-1.5 ${
            presenceSoftOpen ? softFailMistWashClass : ""
          }`}
          style={{ animationDelay: "40ms" }}
          aria-label={t(locale, "collab.members")}
        >
          <div
            className={`flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-bp-sm p-1 ${
              presenceSoftOpen
                ? "bg-mist/55 shadow-[inset_3px_0_0_var(--bp-river)]"
                : "bg-mist/50"
            }`}
            role="list"
            aria-label={t(locale, "collab.members")}
          >
            {visible.map((m, i) => (
              <PresenceChip
                key={m.id}
                member={m}
                locale={locale}
                presence={presenceFor(m)}
                style={{ animationDelay: `${Math.min(i, 4) * 40 + 55}ms` }}
              />
            ))}
            {overflow > 0 ? (
              <span
                className="animate-rise inline-flex h-8 shrink-0 items-center rounded-bp-xs bg-foam/80 px-2 text-[0.65rem] font-semibold tabular-nums tracking-tight text-ink-soft/80"
                style={{ animationDelay: "115ms" }}
              >
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
              <span
                className="animate-rise px-2 py-1.5 text-sm leading-snug text-ink-soft/80"
                style={{ animationDelay: "70ms" }}
              >
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
                className="animate-rise rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-2.5 py-1.5 text-xs text-ink-soft outline-none transition duration-bp-fast ease-bp-out hover:border-river/40 focus:border-river focus:ring-2 focus:ring-focus/35"
                style={{ animationDelay: "85ms" }}
                aria-label={t(locale, "collab.inviteRole")}
              >
                <option value="editor">{t(locale, "collab.role.editor")}</option>
                <option value="viewer">{t(locale, "collab.role.viewer")}</option>
              </select>
              <button
                type="button"
                onClick={() => void createInvite()}
                className="animate-rise rounded-bp-sm bg-river px-3.5 py-1.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                style={{ animationDelay: "100ms" }}
              >
                {t(locale, "collab.invite")}
              </button>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="animate-rise rounded-bp-sm px-3 py-1.5 text-sm text-ink-soft/80 transition duration-bp-fast ease-bp-out hover:bg-mist/60 hover:text-river active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                style={{ animationDelay: "115ms" }}
              >
                {open ? t(locale, "collab.hide") : t(locale, "collab.show")}
              </button>
            </div>
          ) : null}
        </SheetPresence>
      </div>

      {hardError ? (
        <p className="mt-2 animate-rise text-sm text-ink-soft" role="alert">
          {hardError}
        </p>
      ) : null}

      {/*
        Invite SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
        parity (BEA-420): SoftFailBadge · SoftFailSupport · softFailMistWashClass ·
        presence SoftFail yields. Craft: ?inviteSoftFail=1 — never timber /
        Failed to fetch.
      */}
      <SheetPresence
        open={open}
        className="mt-4 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
        style={{ animationDelay: "40ms" }}
        aria-label={t(locale, "collab.inviteEyebrow")}
      >
        <header className="relative border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "collab.inviteEyebrow")}
              </span>
              {inviteSoftOpen ? (
                <SoftFailSupport>
                  {t(locale, "collab.inviteSoftSupport")}
                </SoftFailSupport>
              ) : (
                <span className="text-[11px] leading-snug text-ink-soft/80">
                  {t(locale, "collab.inviteSupport")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {inviteSoftOpen ? (
                <SoftFailBadge>
                  {t(locale, "collab.inviteSoftBadge")}
                </SoftFailBadge>
              ) : (
                <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "collab.inviteLiveBadge")}
                </SoftFailLiveBadge>
              )}
              {lastInvite ? (
                <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                  {t(locale, `collab.role.${lastInvite.invite.role}`)}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        {/* Compact SoftFail under azure invite rail — never timber / Failed to fetch. */}
        <SoftFailNotice open={inviteSoftOpen} compact>
          {inviteSoftCopy}
        </SoftFailNotice>

        <div className={`space-y-4 px-4 py-4 ${softFailMistWashClass}`}>
          {lastInvite ? (
            <SheetPresence
              open
              className={`overflow-hidden rounded-bp-sm p-3.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:p-4 ${
                inviteSoftOpen
                  ? "bg-gradient-to-br from-mist/55 via-mist/28 to-transparent"
                  : "bg-gradient-to-br from-mist/45 via-mist/20 to-transparent"
              }`}
              style={{ animationDelay: "40ms" }}
              aria-label={t(locale, "collab.inviteCodeEyebrow")}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "collab.inviteCodeEyebrow")}
              </p>
              <p
                className="animate-rise mt-2 font-display text-base font-semibold leading-snug tracking-tight text-ink md:text-lg"
                style={{ animationDelay: "80ms" }}
              >
                {t(locale, "collab.shareHint")}
              </p>
              <div
                className="animate-rise mt-3 flex flex-wrap items-center gap-2.5"
                style={{ animationDelay: "120ms" }}
              >
                <code className="rounded-bp-sm bg-river/10 px-3 py-2 font-mono text-sm tracking-wider text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                  {lastInvite.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  className="rounded-bp-sm bg-river px-3.5 py-2 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                >
                  {copied
                    ? t(locale, "collab.copied")
                    : t(locale, "collab.copyLink")}
                </button>
              </div>
              <p
                className="animate-rise mt-2.5 break-all text-xs leading-relaxed text-ink-soft/80"
                style={{ animationDelay: "160ms" }}
              >
                {lastInvite.inviteUrl}
              </p>
            </SheetPresence>
          ) : (
            <p className="animate-rise text-sm leading-snug text-ink-soft/80">
              {t(locale, "collab.shareHint")}
            </p>
          )}
        </div>

        {/*
          Members roster / companions list — wave 54 residual (BEA-518): row
          inset hover · empty leading-snug. SoftFail untouched. Beyond invite
          #366 / presence pills #355.
        */}
        <div className="border-t border-[color:var(--bp-line)]">
          <header className="flex flex-wrap items-center justify-between gap-2 bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
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
              <span
                className={`inline-flex items-center gap-1.5 transition duration-bp-fast ease-bp-out ${softFailLiveBadgeClass}`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-river animate-presence-pulse"
                  aria-hidden
                />
                {t(locale, "collab.presence.live")}
              </span>
            ) : null}
          </header>

          <SheetPresence
            open
            className="relative px-3 py-3"
            style={{ animationDelay: "55ms" }}
            aria-label={t(locale, "collab.presence.listEyebrow")}
          >
            {/* Mist spine — Lumen river/mist mix (timeline track parity) */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-7 left-[1.65rem] top-7 w-px"
              style={{
                background:
                  "color-mix(in srgb, var(--bp-mist) 72%, var(--bp-river))",
              }}
            />
            <ul
              className="relative m-0 list-none space-y-0.5"
              role="list"
              aria-label={t(locale, "collab.presence.listEyebrow")}
            >
              {members.map((m, i) => {
                const presence = presenceFor(m);
                return (
                  <li
                    key={m.id}
                    className="animate-rise relative z-[1] flex items-center justify-between gap-3 rounded-bp-sm px-2 py-2 transition duration-bp-fast ease-bp-out-strong hover:bg-mist/40 hover:shadow-[inset_2px_0_0_var(--bp-river)]"
                    style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PresenceAvatar
                        member={m}
                        size="md"
                        presence={presence}
                      />
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium tracking-tight text-ink">
                          {m.displayName ?? m.userId}
                        </span>
                        <span
                          className={`mt-0.5 inline-flex rounded-bp-xs px-1.5 py-px text-[0.65rem] font-semibold uppercase leading-4 tracking-[0.14em] transition duration-bp-fast ease-bp-out-strong ${PRESENCE_PILL[presence]}`}
                        >
                          {t(locale, `collab.presence.${presence}`)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-bp-xs px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${ROLE_CHIP[m.role]}`}
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
                <li className="animate-rise space-y-1 px-2 py-3">
                  <p className="font-display text-sm font-semibold leading-snug tracking-tight text-ink">
                    {t(locale, "collab.presence.empty")}
                  </p>
                </li>
              ) : null}
            </ul>
          </SheetPresence>
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
      className={`animate-rise inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-bp-xs py-1 pl-1 pr-2 transition duration-bp-fast ease-bp-out-strong active:scale-[0.98] focus-within:ring-2 focus-within:ring-focus/35 ${
        active
          ? "bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
          : "text-ink-soft hover:bg-foam/80 hover:text-river hover:shadow-[inset_2px_0_0_var(--bp-river)]"
      }`}
      style={style}
    >
      <PresenceAvatar member={member} size="sm" presence={presence} />
      <span className="min-w-0 truncate text-xs font-semibold tracking-tight">
        {shortName(member)}
      </span>
      <span
        className={`shrink-0 rounded-bp-xs px-1.5 py-px text-[0.65rem] font-semibold uppercase leading-4 tracking-[0.14em] ${ROLE_CHIP[member.role]}`}
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
