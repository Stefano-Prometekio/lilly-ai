export type CampaignStep = "intake" | "research" | "calls" | "compare" | "negotiate" | "recommend";

export type BriefStatus = "draft" | "confirmed";

export interface IntakeDocumentEvidence {
  id: string;
  name: string;
  mimeType: string;
  extractedFields: string[];
  importedAt: string;
}

export interface IntakeEvidence {
  voiceInterviewCompleted: boolean;
  voiceConversationId?: string;
  documents: IntakeDocumentEvidence[];
}

export interface CateringBrief {
  id: string;
  version: number;
  status: BriefStatus;
  eventType: string;
  eventDate: string;
  city: string;
  venueAddress: string;
  guestCount: number;
  serviceStyle: string;
  menuPreference: string;
  dietaryRequirements: string;
  staffingHours: number;
  targetBudget: number;
  absoluteMaximum: number;
  radiusKm: number;
  currency: "EUR" | "USD" | "GBP";
  mayUseVerifiedLeverage: boolean;
  mayDiscloseTargetBudget: boolean;
  mayBook: false;
  intakeEvidence: IntakeEvidence;
  canonicalJson?: string;
  contentHash?: string;
  confirmedAt?: string;
}

export interface MarketSource {
  title: string;
  url: string;
  sourceType: "vendor" | "directory" | "market-guide" | "google-places";
  observedPrice?: number;
  note: string;
}

export interface MarketVendor {
  id: string;
  name: string;
  address?: string;
  website?: string;
  mapsUrl?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
}

export interface MarketReference {
  status: "idle" | "researching" | "complete" | "fallback";
  lowTotal: number;
  medianTotal: number;
  highTotal: number;
  medianPerGuest: number;
  sampleSize: number;
  confidence: number;
  summary: string;
  sources: MarketSource[];
  vendors: MarketVendor[];
  researchedAt?: string;
}

export type Persona = "hidden-fees" | "upseller" | "stonewaller";

export interface QuoteComponents {
  foodAndBeverage: number;
  staffing: number;
  delivery: number;
  tableware: number;
  tax: number;
  other: number;
}

export type QuoteComponentKey = keyof QuoteComponents;

export type CallOutcomeKind = "itemized_quote" | "callback_commitment" | "documented_decline";

export interface CallOutcome {
  kind: CallOutcomeKind;
  summary: string;
  callbackAt?: string;
  finalizedAt: string;
}

export interface EvidenceCitation {
  id: string;
  kind: "transcript" | "recording" | "document";
  label: string;
  excerpt?: string;
  timestampSeconds?: number;
  url?: string;
  callSessionId?: string;
}

export interface NegotiationRecord {
  initialTotal: number;
  finalTotal: number;
  delta: number;
  changedTerms: string;
  leverageEvidenceId: string;
  finalizedAt: string;
}

export interface VendorQuote {
  id: string;
  vendorName: string;
  persona: Persona;
  status: "not-started" | "calling" | "captured" | "negotiated";
  headlineTotal: number;
  components: QuoteComponents;
  completeness: number;
  evidenceConfidence: number;
  depositPercent: number;
  cancellationDays: number;
  validUntil: string;
  notes: string;
  missingComponents: QuoteComponentKey[];
  outcome?: CallOutcome;
  draftOutcomeKind: CallOutcomeKind;
  callbackAt?: string;
  transcriptTimestampSeconds?: number;
  transcriptUrl?: string;
  recordingUrl?: string;
  evidence: EvidenceCitation[];
  briefVersion?: number;
  briefHash?: string;
  briefSnapshot?: string;
  initialNormalizedTotal?: number;
  negotiatedChange?: string;
  negotiation?: NegotiationRecord;
}

export interface NormalizedQuote extends VendorQuote {
  normalizedTotal: number;
  varianceFromMarket: number;
  suspiciousLow: boolean;
  score: number;
  eligibleForRanking: boolean;
  ineligibilityReasons: string[];
}

export interface NegotiationPlan {
  id: string;
  finalistId: string;
  alternativeQuoteId: string;
  alternativeVendorName: string;
  alternativeTotal: number;
  leverageEvidenceId: string;
  permittedClaim: string;
  targetRequest: string;
  briefHash: string;
  createdAt: string;
}
