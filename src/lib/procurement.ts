import type { CateringBrief, MarketReference, NormalizedQuote, VendorQuote } from "../domain";

function createLocalId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export const initialBrief: CateringBrief = {
  id: createLocalId("brief"),
  version: 1,
  status: "draft",
  eventType: "Corporate reception",
  eventDate: "2026-09-18",
  city: "Brussels, Belgium",
  venueAddress: "",
  guestCount: 120,
  serviceStyle: "Standing reception with passed bites",
  menuPreference: "Modern seasonal menu",
  dietaryRequirements: "Vegetarian options and strict nut-allergy controls",
  staffingHours: 6,
  targetBudget: 6_000,
  absoluteMaximum: 7_000,
  radiusKm: 25,
  currency: "EUR",
  mayUseVerifiedLeverage: true,
  mayDiscloseTargetBudget: false,
  mayBook: false,
};

export const emptyMarketReference: MarketReference = {
  status: "idle",
  lowTotal: 0,
  medianTotal: 0,
  highTotal: 0,
  medianPerGuest: 0,
  sampleSize: 0,
  confidence: 0,
  summary: "Run market research after confirming the brief.",
  sources: [],
};

export function fallbackMarketReference(brief: CateringBrief): MarketReference {
  const scale = Math.max(brief.guestCount, 1);
  return {
    status: "fallback",
    lowTotal: Math.round(scale * 32),
    medianTotal: Math.round(scale * 44),
    highTotal: Math.round(scale * 62),
    medianPerGuest: 44,
    sampleSize: 0,
    confidence: 0.25,
    summary:
      "Illustrative fallback only. Connect the market-baseline Edge Function before using this figure as negotiation evidence.",
    sources: [],
    researchedAt: new Date().toISOString(),
  };
}

export const initialQuotes: VendorQuote[] = [
  {
    id: createLocalId("quote"),
    vendorName: "Vendor A",
    persona: "hidden-fees",
    status: "not-started",
    headlineTotal: 3_800,
    components: {
      foodAndBeverage: 3_800,
      staffing: 900,
      delivery: 250,
      tableware: 420,
      tax: 320,
      other: 0,
    },
    completeness: 0.9,
    evidenceConfidence: 0.82,
    depositPercent: 50,
    cancellationDays: 7,
    validUntil: "",
    notes: "Low headline price; ask explicitly about staff, delivery, tableware, and tax.",
  },
  {
    id: createLocalId("quote"),
    vendorName: "Vendor B",
    persona: "upseller",
    status: "not-started",
    headlineTotal: 5_450,
    components: {
      foodAndBeverage: 4_300,
      staffing: 750,
      delivery: 250,
      tableware: 0,
      tax: 150,
      other: 0,
    },
    completeness: 0.96,
    evidenceConfidence: 0.91,
    depositPercent: 30,
    cancellationDays: 14,
    validUntil: "",
    notes: "Strong dietary coverage; redirects toward a premium package.",
  },
  {
    id: createLocalId("quote"),
    vendorName: "Vendor C",
    persona: "stonewaller",
    status: "not-started",
    headlineTotal: 4_780,
    components: {
      foodAndBeverage: 3_850,
      staffing: 650,
      delivery: 0,
      tableware: 180,
      tax: 100,
      other: 0,
    },
    completeness: 0.78,
    evidenceConfidence: 0.7,
    depositPercent: 50,
    cancellationDays: 5,
    validUntil: "",
    notes: "Vague range and limited authority; precise questions unlock details.",
  },
];

export function normalizeQuote(
  quote: VendorQuote,
  reference: MarketReference,
  absoluteMaximum: number,
): NormalizedQuote {
  const normalizedTotal = Object.values(quote.components).reduce(
    (sum, value) => sum + Math.max(value, 0),
    0,
  );
  const hasBaseline = reference.medianTotal > 0;
  const baseline = hasBaseline ? reference.medianTotal : normalizedTotal;
  const varianceFromMarket = hasBaseline ? (normalizedTotal - baseline) / baseline : 0;
  const suspiciousLow = hasBaseline && normalizedTotal < baseline * 0.7;
  const priceScore = Math.max(0, 100 - (normalizedTotal / absoluteMaximum) * 55);
  const evidenceScore = quote.evidenceConfidence * 20;
  const completenessScore = quote.completeness * 15;
  const flexibilityScore = Math.min(10, quote.cancellationDays / 2);

  return {
    ...quote,
    normalizedTotal,
    varianceFromMarket,
    suspiciousLow,
    score:
      Math.round((priceScore + evidenceScore + completenessScore + flexibilityScore) * 10) / 10,
  };
}

export function formatMoney(value: number, currency: CateringBrief["currency"]) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
