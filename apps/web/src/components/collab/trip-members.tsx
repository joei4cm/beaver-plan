"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { TripInvite, TripMember, TripRole } from "@beaver/core";
import { sampleKyotoCollab } from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
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

  const applySeed = useCallback(() => {
    if (tripId !== "sample-kyoto") return false;
    const seed = sampleKyotoCollab();
    setMembers(seed.members);
    setYourRole(seed.yourRole);
    setDemoSeeded(true);
    setError(null);
    return true;
  }, [tripId]);

  const refresh = useCallback(async () => {
    const data = await apiGet<MembersPayload>(`/v1/trips/${tripId}/members`);
    if (tripId === "sample-kyoto" && data.members.length === 0) {
      applySeed();
      return;
    }
    setMembers(data.members);
    setYourRole(data.yourRole);
    setDemoSeeded(false);
    onVersion?.(data.tripVersion);
  }, [applySeed, tripId, onVersion]);

  useEffect(() => {
    startTransition(() => {
      void refresh().catch((e: unknown) => {
        if (isPlannerNoiseError(e)) {
          if (!applySeed()) return;
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
        applySeed();
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

  return (
    <div className="animate-fade border-y border-[color:var(--bp-line)] bg-foam/30 px-1 py-3 md:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-river">
            {t(locale, "collab.members")}
          </span>
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m) => (
              <span
                key={m.id}
                title={`${m.displayName ?? m.userId} · ${m.role}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper bg-river text-[11px] font-semibold text-foam"
              >
                {initials(m)}
              </span>
            ))}
            {pending && members.length === 0 ? (
              <span className="inline-flex h-8 w-16 items-center text-xs text-ink-soft">
                …
              </span>
            ) : null}
          </div>
          <span className="truncate text-sm text-ink-soft">
            {members.length} · v{tripVersion}
            {yourRole ? ` · ${t(locale, `collab.role.${yourRole}`)}` : ""}
            {demoSeeded ? ` · ${t(locale, "collab.demoBadge")}` : ""}
          </span>
        </div>

        {canInvite ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "editor" | "viewer")
              }
              className="rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/80 px-2 py-1.5 text-xs text-ink-soft outline-none focus:border-river"
              aria-label={t(locale, "collab.inviteRole")}
            >
              <option value="editor">{t(locale, "collab.role.editor")}</option>
              <option value="viewer">{t(locale, "collab.role.viewer")}</option>
            </select>
            <button
              type="button"
              onClick={() => void createInvite()}
              className="rounded-bp-sm bg-river px-3 py-1.5 text-sm font-medium text-foam transition hover:bg-river-deep"
            >
              {t(locale, "collab.invite")}
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-bp-sm px-3 py-1.5 text-sm text-ink-soft transition hover:text-river"
            >
              {open ? t(locale, "collab.hide") : t(locale, "collab.show")}
            </button>
          </div>
        ) : null}
      </div>

      {demoSeeded ? (
        <SoftFailNotice className="mt-3" compact>
          {t(locale, "collab.panel.softOffline")}
        </SoftFailNotice>
      ) : null}

      {error && !demoSeeded ? (
        <p className="mt-2 text-sm text-timber" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="animate-sheet-in mt-4 space-y-4 border-t border-[color:var(--bp-line)] pt-4">
          {lastInvite ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">
                {t(locale, "collab.shareHint")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-river/10 px-2 py-1 font-mono text-sm tracking-wider text-river-deep">
                  {lastInvite.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  className="rounded-bp-sm border border-[color:var(--bp-line)] px-3 py-1.5 text-xs text-ink-soft transition hover:border-river/40 hover:text-river"
                >
                  {copied
                    ? t(locale, "collab.copied")
                    : t(locale, "collab.copyLink")}
                </button>
              </div>
              <p className="break-all text-xs text-ink-soft/80">
                {lastInvite.inviteUrl}
              </p>
            </div>
          ) : null}

          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-l-2 border-river/25 pl-3 text-sm"
              >
                <span className="truncate text-ink">
                  {m.displayName ?? m.userId}
                </span>
                <span className="shrink-0 text-ink-soft">
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
      ) : null}
    </div>
  );
}

function initials(m: TripMember): string {
  const label = (m.displayName ?? m.userId).trim();
  const parts = label.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || "?";
}
