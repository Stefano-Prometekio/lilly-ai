import { afterEach, describe, expect, it, vi } from "vitest";
import type { CateringBrief, MarketReference } from "../domain";
import { researchMarket } from "./market-research";
import type { MarketResearchProgress } from "./market-research-progress";

const brief: CateringBrief = {
  id: "brief_test",
  version: 1,
  status: "confirmed",
  eventType: "Corporate reception",
  eventDate: "2026-09-18",
  city: "Brussels",
  venueAddress: "",
  guestCount: 120,
  serviceStyle: "Standing reception",
  menuPreference: "Seasonal menu",
  dietaryRequirements: "Vegetarian options",
  staffingHours: 6,
  targetBudget: 7_000,
  absoluteMaximum: 9_000,
  radiusKm: 25,
  currency: "EUR",
  mayUseVerifiedLeverage: true,
  mayDiscloseTargetBudget: false,
  mayBook: false,
};

const reference: MarketReference = {
  status: "complete",
  lowTotal: 6_000,
  medianTotal: 7_500,
  highTotal: 10_000,
  medianPerGuest: 62.5,
  sampleSize: 2,
  confidence: 0.7,
  summary: "Evidence-backed fixture",
  sources: [],
  vendors: [],
};

function streamedResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        events.forEach((event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } },
  );
}

afterEach(() => vi.restoreAllMocks());

describe("researchMarket progress stream", () => {
  it("reports backend milestones before returning the benchmark", async () => {
    const milestones: MarketResearchProgress[] = [
      {
        stage: "places",
        message: "Finding relevant local caterers",
        detail: "Searching Google Places.",
      },
      {
        stage: "pricing",
        message: "Searching public pricing evidence",
        detail: "Reviewing menus and packages.",
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([
        ...milestones.map((progress) => ({ type: "progress", progress })),
        { type: "complete", reference },
      ]),
    );
    const received: MarketResearchProgress[] = [];

    await expect(researchMarket(brief, (progress) => received.push(progress))).resolves.toEqual(
      reference,
    );
    expect(received).toEqual(milestones);
  });

  it("surfaces a streamed backend failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedResponse([{ type: "error", error: "Google Places failed (403)." }]),
    );

    await expect(researchMarket(brief)).rejects.toThrow("Google Places failed (403).");
  });
});
