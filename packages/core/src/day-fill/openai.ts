import type { PlaceSummary } from "../ports.js";
import type { OpenAiCompatConfig } from "../translation/openai.js";
import {
  estimateWalkMinutes,
  normalizeInterests,
  taggedDemoCatalog,
} from "./catalog.js";
import type {
  DayFillContext,
  DayFillProposedDay,
  DayFillProposedStop,
  DayFillProvider,
} from "./types.js";

function base(cfg: OpenAiCompatConfig): string {
  return (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

function fetchImpl(cfg: OpenAiCompatConfig): typeof fetch {
  return cfg.fetch ?? fetch;
}

type LlmStop = {
  placeId?: string;
  name?: string;
  note?: string;
};

type LlmDay = {
  dayIndex?: number;
  note?: string;
  stops?: LlmStop[];
};

type LlmPayload = {
  rationale?: string;
  days?: LlmDay[];
};

function catalogIndex(ctx: DayFillContext): Map<string, PlaceSummary> {
  const map = new Map<string, PlaceSummary>();
  for (const p of taggedDemoCatalog()) {
    map.set(p.enginePlaceId, p);
    map.set(p.name.toLowerCase(), p);
  }
  for (const p of ctx.catalog) {
    map.set(p.enginePlaceId, p);
    map.set(p.name.toLowerCase(), p);
  }
  for (const s of ctx.stops) {
    const summary: PlaceSummary = {
      enginePlaceId: s.place.enginePlaceId,
      name: s.place.name,
      address: s.place.address,
      lat: s.place.lat,
      lng: s.place.lng,
    };
    map.set(s.place.enginePlaceId, summary);
    map.set(s.place.name.toLowerCase(), summary);
  }
  return map;
}

function resolveStop(
  raw: LlmStop,
  index: Map<string, PlaceSummary>,
  existingByPlace: Map<string, string>,
): DayFillProposedStop | null {
  const byId = raw.placeId ? index.get(raw.placeId) : undefined;
  const byName = raw.name ? index.get(raw.name.trim().toLowerCase()) : undefined;
  const place = byId ?? byName;
  if (!place) return null;
  return {
    existingStopId: existingByPlace.get(place.enginePlaceId),
    place,
    userNote: raw.note,
  };
}

function extractJson(text: string): LlmPayload {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("openai_day_fill_no_json");
  return JSON.parse(body.slice(start, end + 1)) as LlmPayload;
}

/** OpenAI-compatible chat completion day-fill. */
export class OpenAiDayFillProvider implements DayFillProvider {
  readonly id = "openai-day-fill";

  constructor(private readonly cfg: OpenAiCompatConfig) {}

  async propose(ctx: DayFillContext): Promise<{
    days: DayFillProposedDay[];
    rationale?: string;
  }> {
    const interests = normalizeInterests(ctx.prefs.interests);
    const maxWalk = Math.max(20, Math.min(240, ctx.prefs.maxWalkMinutesPerDay));
    const dayCount = Math.max(
      1,
      Math.min(
        7,
        ctx.prefs.dayCount ??
          (ctx.days.length > 0 ? ctx.days.length : 3),
      ),
    );
    const index = catalogIndex(ctx);
    const catalogList = [...new Map(
      [...taggedDemoCatalog(), ...ctx.catalog].map((p) => [p.enginePlaceId, p]),
    ).values()];

    const existingLines = ctx.stops.map(
      (s) =>
        `- ${s.place.enginePlaceId} | ${s.place.name} | day=${s.dayId} | order=${s.order}`,
    );
    const catalogLines = catalogList.map((p) => {
      const tags = taggedDemoCatalog().find(
        (t) => t.enginePlaceId === p.enginePlaceId,
      )?.tags;
      return `- ${p.enginePlaceId} | ${p.name} | tags=${(tags ?? []).join(",")}`;
    });

    const locale = ctx.locale ?? ctx.trip.locale ?? "zh-CN";
    const system = [
      "You are Beaver Plan / 海狸旅行 itinerary assistant.",
      "Propose a day-by-day stop plan. Prefer catalog placeIds. Reuse existing stops when listed.",
      "Respect max walking minutes/day as a soft budget (cluster nearby places).",
      "Return ONLY compact JSON:",
      '{"rationale":"…","days":[{"dayIndex":0,"note":"…","stops":[{"placeId":"demo-…","note":"…"}]}]}',
      "No markdown, no commentary outside JSON.",
    ].join(" ");

    const user = [
      `locale: ${locale}`,
      `destination: ${ctx.trip.destination ?? "(none)"}`,
      `timezone: ${ctx.trip.timezone}`,
      `interests: ${interests.join(", ")}`,
      `maxWalkMinutesPerDay: ${maxWalk}`,
      `dayCount: ${dayCount}`,
      `existingStops:`,
      existingLines.length ? existingLines.join("\n") : "(none)",
      `catalog:`,
      catalogLines.join("\n"),
    ].join("\n");

    const model = this.cfg.chatModel ?? "gpt-4o-mini";
    const res = await fetchImpl(this.cfg)(`${base(this.cfg)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openai_day_fill_${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);

    const existingByPlace = new Map(
      ctx.stops.map((s) => [s.place.enginePlaceId, s.id]),
    );
    const startDate =
      ctx.days[0]?.date ?? ctx.trip.startDate ?? new Date().toISOString().slice(0, 10);

    const days: DayFillProposedDay[] = [];
    const rawDays = parsed.days ?? [];
    for (let i = 0; i < dayCount; i++) {
      const raw = rawDays.find((d) => d.dayIndex === i) ?? rawDays[i];
      const stops: DayFillProposedStop[] = [];
      let prev: PlaceSummary | null = null;
      for (const s of raw?.stops ?? []) {
        const resolved = resolveStop(s, index, existingByPlace);
        if (!resolved) continue;
        if (prev) {
          resolved.estimatedWalkMinutes = estimateWalkMinutes(
            prev,
            resolved.place,
          );
        } else {
          resolved.estimatedWalkMinutes = 0;
        }
        prev = resolved.place;
        stops.push(resolved);
      }
      const existingDay = ctx.days[i];
      days.push({
        dayIndex: i,
        date:
          existingDay?.date ??
          addDaysTo(startDate, i),
        note: raw?.note ?? existingDay?.note,
        stops,
      });
    }

    return {
      days,
      rationale: parsed.rationale,
    };
  }
}

function addDaysTo(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
