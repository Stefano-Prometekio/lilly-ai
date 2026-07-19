import type {
  CateringBrief,
  MarketReference,
  NegotiationPlan,
  NormalizedQuote,
  QuoteComponentKey,
  VendorQuote,
} from "../domain";

function createLocalId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export const initialBrief: CateringBrief = {
  id: createLocalId("brief"),
  version: 1,
  status: "draft",
  eventType: "",
  eventDate: "",
  city: "",
  venueAddress: "",
  guestCount: 0,
  serviceStyle: "",
  menuPreference: "",
  dietaryRequirements: "",
  staffingHours: 0,
  targetBudget: 0,
  absoluteMaximum: 0,
  radiusKm: 25,
  currency: "EUR",
  mayUseVerifiedLeverage: true,
  mayDiscloseTargetBudget: false,
  mayBook: false,
  intakeEvidence: {
    voiceInterviewCompleted: false,
    documents: [],
  },
};

export const quoteComponentKeys: QuoteComponentKey[] = [
  "foodAndBeverage",
  "staffing",
  "delivery",
  "tableware",
  "tax",
  "other",
];

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
  vendors: [],
};

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
    missingComponents: [...quoteComponentKeys],
    draftOutcomeKind: "itemized_quote",
    evidence: [],
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
    missingComponents: [...quoteComponentKeys],
    draftOutcomeKind: "itemized_quote",
    evidence: [],
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
    missingComponents: [...quoteComponentKeys],
    draftOutcomeKind: "itemized_quote",
    evidence: [],
  },
];

export function validateStructuredOutcome(quote: VendorQuote, brief: CateringBrief) {
  const errors: string[] = [];
  if (
    brief.status !== "confirmed" ||
    !brief.canonicalJson ||
    !brief.contentHash ||
    !brief.confirmedAt
  ) {
    errors.push("Confirm and freeze the canonical brief before finalizing a call.");
  }

  if (!quote.notes.trim()) errors.push("Add an evidence-backed outcome summary.");

  if (quote.draftOutcomeKind === "itemized_quote") {
    if (quote.headlineTotal <= 0) errors.push("Record the headline total.");
    if (quote.missingComponents.length > 0) {
      errors.push(`Confirm every line item: ${quote.missingComponents.join(", ")}.`);
    }
    if (quote.depositPercent < 0 || quote.depositPercent > 100) {
      errors.push("Deposit must be between 0% and 100%.");
    }
    if (quote.cancellationDays < 0) errors.push("Cancellation notice cannot be negative.");
    if (!quote.validUntil) errors.push("Record quote validity.");
    if (quote.transcriptTimestampSeconds == null || quote.transcriptTimestampSeconds < 0) {
      errors.push("Add the transcript timestamp supporting the read-back.");
    }
  }

  if (quote.draftOutcomeKind === "callback_commitment" && !quote.callbackAt) {
    errors.push("Record the promised callback date and time.");
  }

  return errors;
}

export function finalizeVendorQuote(quote: VendorQuote, brief: CateringBrief): VendorQuote {
  const errors = validateStructuredOutcome(quote, brief);
  if (errors.length) throw new Error(errors.join(" "));

  const finalizedAt = new Date().toISOString();
  const transcriptEvidence = quote.notes.trim()
    ? [
        {
          id: `${quote.id}-transcript`,
          kind: "transcript" as const,
          label: `${quote.vendorName} outcome read-back`,
          excerpt: quote.notes.trim(),
          timestampSeconds: quote.transcriptTimestampSeconds,
          url: quote.transcriptUrl?.trim() || undefined,
          callSessionId: quote.id,
        },
      ]
    : [];
  const recordingEvidence = quote.recordingUrl?.trim()
    ? [
        {
          id: `${quote.id}-recording`,
          kind: "recording" as const,
          label: `${quote.vendorName} call recording`,
          url: quote.recordingUrl.trim(),
          callSessionId: quote.id,
        },
      ]
    : [];
  const evidence = [...transcriptEvidence, ...recordingEvidence];
  const evidenceConfidence = recordingEvidence.length ? 0.95 : transcriptEvidence.length ? 0.85 : 0;

  return {
    ...quote,
    status: "captured",
    outcome: {
      kind: quote.draftOutcomeKind,
      summary: quote.notes.trim(),
      callbackAt: quote.callbackAt || undefined,
      finalizedAt,
    },
    completeness: quote.draftOutcomeKind === "itemized_quote" ? 1 : 0,
    evidenceConfidence,
    evidence,
    briefVersion: brief.version,
    briefHash: brief.contentHash,
    briefSnapshot: brief.canonicalJson,
  };
}

export function normalizeQuote(
  quote: VendorQuote,
  reference: MarketReference,
  absoluteMaximum: number,
  confirmedBriefHash?: string,
): NormalizedQuote {
  const normalizedTotal = Object.values(quote.components).reduce(
    (sum, value) => sum + Math.max(value, 0),
    0,
  );
  const hasBaseline = reference.medianTotal > 0;
  const baseline = hasBaseline ? reference.medianTotal : normalizedTotal;
  const varianceFromMarket = hasBaseline ? (normalizedTotal - baseline) / baseline : 0;
  const suspiciousLow = hasBaseline && normalizedTotal < baseline * 0.7;
  const ineligibilityReasons: string[] = [];
  if (quote.outcome?.kind !== "itemized_quote") ineligibilityReasons.push("No itemized quote");
  if (quote.status !== "captured" && quote.status !== "negotiated") {
    ineligibilityReasons.push("Call outcome is not finalized");
  }
  if (quote.missingComponents.length) ineligibilityReasons.push("Required line items are unknown");
  if (quote.completeness < 0.85) ineligibilityReasons.push("Quote completeness is below 85%");
  if (quote.evidenceConfidence < 0.75) {
    ineligibilityReasons.push("Evidence confidence is below 75%");
  }
  if (!quote.evidence.some((item) => item.kind === "transcript" && (item.excerpt || item.url))) {
    ineligibilityReasons.push("Transcript evidence is missing");
  }
  if (!confirmedBriefHash || quote.briefHash !== confirmedBriefHash) {
    ineligibilityReasons.push("Quote does not reference the confirmed brief hash");
  }
  if (!hasBaseline || reference.status !== "complete") {
    ineligibilityReasons.push("Market reference is not complete");
  }
  if (normalizedTotal <= 0) ineligibilityReasons.push("Normalized total is not positive");

  const eligibleForRanking = ineligibilityReasons.length === 0;
  const priceScore =
    absoluteMaximum > 0 ? Math.max(0, 45 - (normalizedTotal / absoluteMaximum) * 25) : 0;
  const evidenceScore = quote.evidenceConfidence * 25;
  const completenessScore = quote.completeness * 20;
  const flexibilityScore = Math.min(10, quote.cancellationDays / 2);
  const rawScore = priceScore + evidenceScore + completenessScore + flexibilityScore;

  return {
    ...quote,
    normalizedTotal,
    varianceFromMarket,
    suspiciousLow,
    score: eligibleForRanking ? Math.min(100, Math.round(rawScore * 10) / 10) : 0,
    eligibleForRanking,
    ineligibilityReasons,
  };
}

export function buildNegotiationPlan(
  finalist: NormalizedQuote | undefined,
  quotes: NormalizedQuote[],
  brief: CateringBrief,
): NegotiationPlan | undefined {
  if (!finalist?.eligibleForRanking || !brief.mayUseVerifiedLeverage || !brief.contentHash) {
    return undefined;
  }

  const alternative = quotes
    .filter(
      (quote) =>
        quote.id !== finalist.id &&
        quote.eligibleForRanking &&
        quote.briefHash === brief.contentHash &&
        quote.normalizedTotal < finalist.normalizedTotal,
    )
    .sort((left, right) => left.normalizedTotal - right.normalizedTotal)[0];
  const leverageEvidence = alternative?.evidence.find(
    (item) => item.kind === "transcript" && Boolean(item.excerpt || item.url),
  );
  if (!alternative || !leverageEvidence) return undefined;

  return {
    id: `plan-${finalist.id}-${leverageEvidence.id}`,
    finalistId: finalist.id,
    alternativeQuoteId: alternative.id,
    alternativeVendorName: alternative.vendorName,
    alternativeTotal: alternative.normalizedTotal,
    leverageEvidenceId: leverageEvidence.id,
    permittedClaim: `A qualifying alternative is ${formatMoney(
      finalist.normalizedTotal - alternative.normalizedTotal,
      brief.currency,
    )} lower for the exact same confirmed scope.`,
    targetRequest:
      finalist.components.delivery > 0
        ? "Waive or reduce the delivery fee without changing scope."
        : "Improve cancellation or deposit terms without changing scope.",
    briefHash: brief.contentHash,
    createdAt: new Date().toISOString(),
  };
}

export function formatMoney(value: number, currency: CateringBrief["currency"]) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
