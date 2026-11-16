import type { Day, MapEngineId, PlaceRef, Stop, Trip } from "../domain.js";
import { toPlaceRef } from "../ports.js";
import { addDaysIso, todayIsoDate } from "../templates.js";
import type { DayFillProposal } from "./types.js";

export type MaterializeDayFillInput = {
  trip: Trip;
  proposal: DayFillProposal;
  /** Existing days (kept by index when possible). */
  existingDays: Day[];
  /** Map engine for new PlaceRefs. */
  engine: MapEngineId;
  /** id factory — Workers/crypto.randomUUID in API. */
  newId: () => string;
};

export type MaterializeDayFillResult = {
  days: Day[];
  stops: Stop[];
};

/**
 * Turn a confirmed proposal into days + stops ready for replaceDays/replaceStops.
 * Replaces the trip's day/stop structure for the proposed dayCount.
 */
export function materializeDayFill(
  input: MaterializeDayFillInput,
): MaterializeDayFillResult {
  const { trip, proposal, existingDays, engine, newId } = input;
  const start =
    existingDays[0]?.date ?? trip.startDate ?? todayIsoDate();

  const days: Day[] = proposal.days.map((d, i) => {
    const prev = existingDays[i];
    return {
      id: prev?.id ?? newId(),
      tripId: trip.id,
      date: d.date ?? prev?.date ?? addDaysIso(start, i),
      note: d.note ?? prev?.note,
    };
  });

  const stops: Stop[] = [];
  for (const d of proposal.days) {
    const day = days[d.dayIndex];
    if (!day) continue;
    d.stops.forEach((s, order) => {
      const place: PlaceRef = toPlaceRef(engine, s.place);
      stops.push({
        id: s.existingStopId && !stops.some((x) => x.id === s.existingStopId)
          ? s.existingStopId
          : newId(),
        dayId: day.id,
        order,
        place,
        userNote: s.userNote,
        photos: [],
      });
    });
  }

  return { days, stops };
}

export function tripDatesFromDays(days: Day[]): {
  startDate?: string;
  endDate?: string;
} {
  if (days.length === 0) return {};
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return {
    startDate: sorted[0]?.date,
    endDate: sorted[sorted.length - 1]?.date,
  };
}
