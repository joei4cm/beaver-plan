"use client";

import type { Day, Leg, Stop, Trip } from "@beaver/core";
import {
  CITY_TEMPLATES,
  addDaysIso,
  getCityTemplate,
  placeRefForTemplateStop,
  todayIsoDate,
  type CityTemplate,
} from "@beaver/core";

const STORAGE_KEY = "beaver-plan:local-trips-v1";

export type LocalTripBundle = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  templateId?: string;
  local: true;
};

export type TemplateCard = {
  id: string;
  title: { "zh-CN": string; en: string };
  destination: string;
  description: { "zh-CN": string; en: string };
  accent: string;
  dayCount: number;
  stopCount: number;
};

export type CreateLocalTripInput = {
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  locale?: Trip["locale"];
  templateId?: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): LocalTripBundle[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalTripBundle[];
    return Array.isArray(parsed) ? parsed.filter((b) => b?.trip?.id) : [];
  } catch {
    return [];
  }
}

function writeAll(bundles: LocalTripBundle[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundles));
}

export function templateCardsFromSeed(): TemplateCard[] {
  return CITY_TEMPLATES.map(toTemplateCard);
}

export function toTemplateCard(tpl: CityTemplate): TemplateCard {
  return {
    id: tpl.id,
    title: tpl.title,
    destination: tpl.destination,
    description: tpl.description,
    accent: tpl.accent,
    dayCount: tpl.days.length,
    stopCount: tpl.days.reduce((n, d) => n + d.stops.length, 0),
  };
}

export function listLocalTrips(): Trip[] {
  return readAll()
    .map((b) => b.trip)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLocalTrip(id: string): LocalTripBundle | null {
  return readAll().find((b) => b.trip.id === id) ?? null;
}

export function saveLocalTrip(bundle: LocalTripBundle): void {
  const all = readAll().filter((b) => b.trip.id !== bundle.trip.id);
  all.unshift({ ...bundle, local: true });
  writeAll(all);
}

export function materializeTemplateLocal(
  templateId: string,
  overrides: {
    title?: string;
    startDate?: string;
    locale?: Trip["locale"];
  } = {},
): LocalTripBundle | null {
  const tpl = getCityTemplate(templateId);
  if (!tpl) return null;

  const stamp = nowIso();
  const start = overrides.startDate?.trim() || todayIsoDate();
  const maxOffset = Math.max(...tpl.days.map((d) => d.dayOffset), 0);
  const end = addDaysIso(start, maxOffset);
  const locale = overrides.locale ?? tpl.locale;
  const title =
    overrides.title?.trim() ||
    tpl.title[locale] ||
    tpl.title["zh-CN"];
  const tripId = newId();

  const trip: Trip = {
    id: tripId,
    title,
    destination: tpl.destination,
    startDate: start,
    endDate: end,
    timezone: tpl.timezone,
    locale,
    mapEngine: "auto",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const dayIdByOffset = new Map<number, string>();
  const days: Day[] = tpl.days.map((d) => {
    const id = newId();
    dayIdByOffset.set(d.dayOffset, id);
    return {
      id,
      tripId,
      date: addDaysIso(start, d.dayOffset),
      note: d.note,
    };
  });

  const stops: Stop[] = [];
  for (const d of tpl.days) {
    const dayId = dayIdByOffset.get(d.dayOffset)!;
    d.stops.forEach((s, order) => {
      stops.push({
        id: newId(),
        dayId,
        order,
        place: placeRefForTemplateStop(s),
        userNote: s.userNote,
        photos: [],
        bookingLinks: [],
      });
    });
  }

  const bundle: LocalTripBundle = {
    trip,
    days,
    stops,
    legs: [],
    templateId: tpl.id,
    local: true,
  };
  saveLocalTrip(bundle);
  return bundle;
}

export function createBlankLocalTrip(
  input: CreateLocalTripInput,
): LocalTripBundle {
  if (input.templateId) {
    const fromTpl = materializeTemplateLocal(input.templateId, {
      title: input.title,
      startDate: input.startDate,
      locale: input.locale as Trip["locale"] | undefined,
    });
    if (fromTpl) {
      if (input.destination?.trim()) {
        fromTpl.trip.destination = input.destination.trim();
      }
      if (input.endDate?.trim()) {
        fromTpl.trip.endDate = input.endDate.trim();
      }
      if (input.timezone?.trim()) {
        fromTpl.trip.timezone = input.timezone.trim();
      }
      fromTpl.trip.updatedAt = nowIso();
      saveLocalTrip(fromTpl);
      return fromTpl;
    }
  }

  const stamp = nowIso();
  const tripId = newId();
  const start = input.startDate?.trim() || todayIsoDate();
  const end = input.endDate?.trim() || start;
  const locale = (input.locale as Trip["locale"] | undefined) ?? "zh-CN";

  const dayId = newId();
  const trip: Trip = {
    id: tripId,
    title: input.title.trim(),
    destination: input.destination?.trim() || undefined,
    startDate: start,
    endDate: end,
    timezone: input.timezone?.trim() || "Asia/Shanghai",
    locale,
    mapEngine: "auto",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const days: Day[] = [
    {
      id: dayId,
      tripId,
      date: start,
      note: undefined,
    },
  ];

  const bundle: LocalTripBundle = {
    trip,
    days,
    stops: [],
    legs: [],
    local: true,
  };
  saveLocalTrip(bundle);
  return bundle;
}

export function sampleTripStub(): Trip {
  return {
    id: "sample-kyoto",
    title: "京都五日",
    destination: "Kyoto",
    startDate: "2026-04-10",
    endDate: "2026-04-14",
    timezone: "Asia/Tokyo",
    locale: "zh-CN",
    mapEngine: "auto",
    version: 1,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

/** Merge API trips with local demo trips; sample always present as fallback seed. */
export function mergeTripLists(
  remote: Trip[],
  opts: { includeSampleFallback: boolean },
): Trip[] {
  const local = listLocalTrips();
  const byId = new Map<string, Trip>();
  for (const trip of remote) byId.set(trip.id, trip);
  for (const trip of local) {
    if (!byId.has(trip.id)) byId.set(trip.id, trip);
  }
  if (opts.includeSampleFallback && !byId.has("sample-kyoto")) {
    byId.set("sample-kyoto", sampleTripStub());
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.id === "sample-kyoto") return 1;
    if (b.id === "sample-kyoto") return -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
