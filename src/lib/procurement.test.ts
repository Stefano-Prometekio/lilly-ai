import { describe, expect, it } from "vitest";
import type { MarketReference, VendorQuote } from "../domain";
import { buildNegotiationPlan, finalizeVendorQuote, normalizeQuote } from "./procurement";
import { createDemoBrief, createDemoQuotes, demoMarketReference } from "./demo-scenario";

const reference: MarketReference = {
  status: "complete",
  lowTotal: 4_000,
  medianTotal: 5_000,
  highTotal: 7_000,
  medianPerGuest: 50,
  sampleSize: 5,
  confidence: 0.8,
  summary: "Fixture",
  sources: [],
  vendors: [],
};

function quoteWithTotal(total: number): VendorQuote {
  return {
    id: "quote_test",
    vendorName: "Test Vendor",
    persona: "hidden-fees",
    status: "captured",
    headlineTotal: total,
    components: {
      foodAndBeverage: total,
      staffing: 0,
      delivery: 0,
      tableware: 0,
      tax: 0,
      other: 0,
    },
    completeness: 1,
    evidenceConfidence: 1,
    depositPercent: 30,
    cancellationDays: 14,
    validUntil: "",
    notes: "",
    missingComponents: [],
    draftOutcomeKind: "itemized_quote",
    evidence: [],
  };
}

describe("normalizeQuote", () => {
  it("adds every disclosed cost component", () => {
    const quote = quoteWithTotal(3_000);
    quote.components = {
      foodAndBeverage: 3_000,
      staffing: 800,
      delivery: 200,
      tableware: 300,
      tax: 500,
      other: 100,
    };

    expect(normalizeQuote(quote, reference, 7_000).normalizedTotal).toBe(4_900);
  });

  it("flags a quote only when it is more than 30% below the market reference", () => {
    expect(normalizeQuote(quoteWithTotal(3_499), reference, 7_000).suspiciousLow).toBe(true);
    expect(normalizeQuote(quoteWithTotal(3_500), reference, 7_000).suspiciousLow).toBe(false);
  });

  it("does not invent a market comparison when research has not run", () => {
    const noReference = { ...reference, status: "idle" as const, medianTotal: 0 };
    const normalized = normalizeQuote(quoteWithTotal(3_000), noReference, 7_000);

    expect(normalized.varianceFromMarket).toBe(0);
    expect(normalized.suspiciousLow).toBe(false);
  });

  it("does not rank a fixture without a structured outcome and matching brief evidence", () => {
    const normalized = normalizeQuote(quoteWithTotal(4_000), reference, 7_000, "brief-hash");

    expect(normalized.eligibleForRanking).toBe(false);
    expect(normalized.score).toBe(0);
    expect(normalized.ineligibilityReasons).toContain("No itemized quote");
  });

  it("requires every structured quote field before finalizing", async () => {
    const brief = await createDemoBrief();
    const draft = quoteWithTotal(4_000);

    expect(() => finalizeVendorQuote(draft, brief)).toThrow(/quote validity/i);
  });

  it("builds leverage only from a lower eligible quote on the same frozen brief", async () => {
    const brief = await createDemoBrief();
    const quotes = createDemoQuotes(brief).map((quote) =>
      normalizeQuote(quote, demoMarketReference, brief.absoluteMaximum, brief.contentHash),
    );
    const finalist = quotes.find((quote) => quote.vendorName === "Maison Feast");
    const plan = buildNegotiationPlan(finalist, quotes, brief);

    expect(plan?.alternativeVendorName).toBe("Stone Table Catering");
    expect(plan?.leverageEvidenceId).toBe("quote_demo_stonewaller-transcript");
    expect(plan?.briefHash).toBe(brief.contentHash);
  });
});
