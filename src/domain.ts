export type CampaignStep = "intake" | "research" | "calls" | "compare" | "negotiate" | "recommend";

export type BriefStatus = "draft" | "confirmed";

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
  initialNormalizedTotal?: number;
  negotiatedChange?: string;
}

export interface NormalizedQuote extends VendorQuote {
  normalizedTotal: number;
  varianceFromMarket: number;
  suspiciousLow: boolean;
  score: number;
}
