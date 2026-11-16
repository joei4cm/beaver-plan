export {
  DAY_FILL_INTERESTS,
  type DayFillInterest,
  type DayFillPrefs,
  type DayFillProposedStop,
  type DayFillProposedDay,
  type DayFillProposal,
  type DayFillContext,
  type DayFillProvider,
  type DayFillStack,
} from "./types.js";
export {
  DEMO_PLACE_TAGS,
  taggedDemoCatalog,
  inferCityHint,
  filterCatalogByCity,
  scorePlaceForInterests,
  stopsPerDayForWalkBudget,
  estimateWalkMinutes,
  normalizeInterests,
  type TaggedPlace,
} from "./catalog.js";
export { DemoDayFillProvider } from "./demo.js";
export { OpenAiDayFillProvider } from "./openai.js";
export {
  createDayFillStack,
  reportDayFillCapabilities,
  type DayFillKeyBag,
} from "./factory.js";
export {
  materializeDayFill,
  tripDatesFromDays,
  type MaterializeDayFillInput,
  type MaterializeDayFillResult,
} from "./apply.js";
