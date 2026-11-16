import type { PlaceSummary } from "../ports.js";
import type { Day, Stop, Trip } from "../domain.js";

/** Interest chips for smart day-fill. */
export const DAY_FILL_INTERESTS = [
  "temples",
  "food",
  "nature",
  "shopping",
  "culture",
  "photo",
] as const;

export type DayFillInterest = (typeof DAY_FILL_INTERESTS)[number];

export type DayFillPrefs = {
  interests: DayFillInterest[];
  /** Soft cap on walking minutes per day (used to size stop counts). */
  maxWalkMinutesPerDay: number;
  /** How many days to propose; defaults to existing trip days or 3. */
  dayCount?: number;
};

export type DayFillProposedStop = {
  /** When reusing an existing trip stop. */
  existingStopId?: string;
  place: PlaceSummary;
  userNote?: string;
  /** Rough walk budget used for this stop (informational). */
  estimatedWalkMinutes?: number;
};

export type DayFillProposedDay = {
  /** 0-based index in the proposal. */
  dayIndex: number;
  /** ISO date when known / planned. */
  date?: string;
  note?: string;
  stops: DayFillProposedStop[];
};

export type DayFillProposal = {
  id: string;
  tripId: string;
  mode: "live" | "demo";
  provider: string;
  prefs: DayFillPrefs;
  rationale?: string;
  days: DayFillProposedDay[];
  createdAt: string;
};

export type DayFillContext = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  prefs: DayFillPrefs;
  /** Extra catalog places (demo POIs + search hits). */
  catalog: PlaceSummary[];
  locale?: "zh-CN" | "en";
};

export type DayFillProvider = {
  readonly id: string;
  propose(ctx: DayFillContext): Promise<{
    days: DayFillProposedDay[];
    rationale?: string;
  }>;
};

export type DayFillStack = {
  provider: DayFillProvider;
  mode: "live" | "demo";
};
