import type {
  CateringBrief,
  MarketReference,
  Persona,
  QuoteComponents,
  VendorQuote,
} from "../domain";
import { confirmCanonicalBrief } from "./canonical-brief";
import { initialBrief } from "./procurement";

export async function createDemoBrief() {
  return confirmCanonicalBrief({
    ...initialBrief,
    id: "brief_demo_catering",
    eventType: "Wedding reception",
    eventDate: "2026-09-18",
    city: "Brussels",
    venueAddress: "Demo Venue, Brussels",
    guestCount: 100,
    serviceStyle: "Plated dinner",
    menuPreference: "Seasonal Belgian menu",
    dietaryRequirements: "Nut-free kitchen; 12 vegetarian meals",
    staffingHours: 6,
    targetBudget: 5_200,
    absoluteMaximum: 7_000,
    radiusKm: 25,
    intakeEvidence: {
      voiceInterviewCompleted: true,
      voiceConversationId: "demo-intake-transcript",
      documents: [
        {
          id: "demo-event-document",
          name: "demo-catering-brief.json",
          mimeType: "application/json",
          extractedFields: [
            "eventType",
            "eventDate",
            "city",
            "guestCount",
            "serviceStyle",
            "menuPreference",
            "dietaryRequirements",
          ],
          importedAt: new Date().toISOString(),
        },
      ],
    },
  });
}

export const demoMarketReference: MarketReference = {
  status: "complete",
  lowTotal: 4_400,
  medianTotal: 5_200,
  highTotal: 6_400,
  medianPerGuest: 52,
  sampleSize: 3,
  confidence: 0.82,
  summary:
    "Scripted dry-run benchmark for a 100-person plated Brussels wedding. Replace with live cited research for judging.",
  sources: [
    {
      title: "Dry-run benchmark fixture",
      url: "#demo-benchmark",
      sourceType: "market-guide",
      observedPrice: 5_200,
      note: "Transparent simulation data; not presented as live market evidence.",
    },
  ],
  vendors: [],
  researchedAt: new Date().toISOString(),
};

interface DemoQuoteInput {
  id: string;
  vendorName: string;
  persona: Persona;
  headlineTotal: number;
  components: QuoteComponents;
  depositPercent: number;
  cancellationDays: number;
  transcriptTimestampSeconds: number;
  notes: string;
}

function createDemoQuote(input: DemoQuoteInput, brief: CateringBrief): VendorQuote {
  const finalizedAt = new Date().toISOString();
  return {
    ...input,
    status: "captured",
    completeness: 1,
    evidenceConfidence: 0.85,
    validUntil: "2026-08-15",
    missingComponents: [],
    draftOutcomeKind: "itemized_quote",
    outcome: {
      kind: "itemized_quote",
      summary: input.notes,
      finalizedAt,
    },
    evidence: [
      {
        id: `${input.id}-transcript`,
        kind: "transcript",
        label: `${input.vendorName} read-back transcript`,
        excerpt: input.notes,
        timestampSeconds: input.transcriptTimestampSeconds,
        callSessionId: input.id,
      },
    ],
    briefVersion: brief.version,
    briefHash: brief.contentHash,
    briefSnapshot: brief.canonicalJson,
  };
}

export function createDemoQuotes(brief: CateringBrief): VendorQuote[] {
  return [
    createDemoQuote(
      {
        id: "quote_demo_hidden_fees",
        vendorName: "Basil & Board",
        persona: "hidden-fees",
        headlineTotal: 3_800,
        components: {
          foodAndBeverage: 3_800,
          staffing: 900,
          delivery: 250,
          tableware: 420,
          tax: 320,
          other: 0,
        },
        depositPercent: 50,
        cancellationDays: 7,
        transcriptTimestampSeconds: 303,
        notes:
          "Headline €3,800; focused questions revealed €900 staffing, €250 delivery, €420 tableware, and €320 tax/service. Vendor confirmed the €5,690 all-in read-back.",
      },
      brief,
    ),
    createDemoQuote(
      {
        id: "quote_demo_upseller",
        vendorName: "Maison Feast",
        persona: "upseller",
        headlineTotal: 5_450,
        components: {
          foodAndBeverage: 4_300,
          staffing: 750,
          delivery: 250,
          tableware: 0,
          tax: 150,
          other: 0,
        },
        depositPercent: 30,
        cancellationDays: 14,
        transcriptTimestampSeconds: 255,
        notes:
          "Lilly declined the premium-package diversion, completed the base scope, and confirmed a €5,450 all-in offer with tableware included.",
      },
      brief,
    ),
    createDemoQuote(
      {
        id: "quote_demo_stonewaller",
        vendorName: "Stone Table Catering",
        persona: "stonewaller",
        headlineTotal: 4_780,
        components: {
          foodAndBeverage: 3_850,
          staffing: 650,
          delivery: 0,
          tableware: 180,
          tax: 100,
          other: 0,
        },
        depositPercent: 50,
        cancellationDays: 5,
        transcriptTimestampSeconds: 322,
        notes:
          "After an initial refusal and broad range, focused questions established a €4,780 exact quote with delivery included and all fees read back.",
      },
      brief,
    ),
  ];
}
