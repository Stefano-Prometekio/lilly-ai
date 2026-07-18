import { describe, expect, it } from "vitest";
import type { MarketReference, VendorQuote } from "../domain";
import { normalizeQuote } from "./procurement";

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
});
