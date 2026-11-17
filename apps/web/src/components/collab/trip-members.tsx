"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { TripInvite, TripMember, TripRole } from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";

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

  const refresh = useCallback(async () => {
    const data = await apiGet<MembersPayload>(`/v1/trips/${tripId}/members`);
    setMembers(data.members);
    setYourRole(data.yourRole);
    onVersion?.(data.tripVersion);
  }, [tripId, onVersion]);

  useEffect(() => {
    startTransition(() => {
      void refresh().catch((e: Error) => {
        // Soft-fail when Neon is absent — avoid red 503 blobs on demo shell.
        if (!/503/.test(e.message)) setError(e.message);
      });
    });
  }, [refresh]);

  async function createInvite() {
    setError(null);
    setCopied(false);
    try {
      const data = await apiSend<InvitePayload>(
        `/v1/trips/${tripId}/invites`,
        "POST",
        { role: inviteRole },
      );
      setLastInvite(data);
      setOpen(true);
    } catch (e) {
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
    <div className="animate-fade border border-[color:var(--bp-line)] bg-foam/40 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.16em] text-river/80">
            {t(locale, "collab.members")}
          </span>
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m) => (
              <span
                key={m.id}
                title={`${m.displayName ?? m.userId} · ${m.role}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-foam bg-river-deep text-[11px] font-medium text-foam"
              >
                {initials(m)}
              </span>
            ))}
          </div>
          <span className="truncate text-sm text-ink-soft">
            {members.length} · v{tripVersion}
            {yourRole ? ` · ${t(locale, `collab.role.${yourRole}`)}` : ""}
          </span>
        </div>

        {canInvite && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "editor" | "viewer")
              }
              className="rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-2 py-1.5 text-xs text-ink-soft outline-none"
              aria-label={t(locale, "collab.inviteRole")}
            >
              <option value="editor">{t(locale, "collab.role.editor")}</option>
              <option value="viewer">{t(locale, "collab.role.viewer")}</option>
            </select>
            <button
              type="button"
              onClick={() => void createInvite()}
              className="rounded-md bg-river px-3 py-1.5 text-sm text-foam transition hover:bg-river-deep"
            >
              {t(locale, "collab.invite")}
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md border border-[color:var(--bp-line)] px-3 py-1.5 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
            >
              {open ? t(locale, "collab.hide") : t(locale, "collab.show")}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-timber">{error}</p>
      )}

      {open && (
        <div className="mt-4 space-y-4 border-t border-[color:var(--bp-line)] pt-4">
          {lastInvite && (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">{t(locale, "collab.shareHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-river-deep/10 px-2 py-1 font-mono text-sm tracking-wider text-river-deep">
                  {lastInvite.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  className="rounded-md border border-[color:var(--bp-line)] px-3 py-1.5 text-xs text-ink-soft hover:border-river/40"
                >
                  {copied ? t(locale, "collab.copied") : t(locale, "collab.copyLink")}
                </button>
              </div>
              <p className="break-all text-xs text-ink-soft/80">
                {lastInvite.inviteUrl}
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-ink">
                  {m.displayName ?? m.userId}
                </span>
                <span className="shrink-0 text-ink-soft">
                  {t(locale, `collab.role.${m.role}`)}
                </span>
              </li>
            ))}
            {pending && members.length === 0 && (
              <li className="text-sm text-ink-soft">{t(locale, "collab.loading")}</li>
            )}
          </ul>
        </div>
      )}
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
