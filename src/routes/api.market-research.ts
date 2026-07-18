import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const briefSchema = z.object({
  eventType: z.string().min(1),
  eventDate: z.string().min(1),
  city: z.string().min(1),
  venueAddress: z.string().optional(),
  guestCount: z.number().int().positive(),
  serviceStyle: z.string().min(1),
  menuPreference: z.string().min(1),
  dietaryRequirements: z.string().min(1),
  staffingHours: z.number().nonnegative(),
  radiusKm: z.number().positive(),
  currency: z.enum(["EUR", "USD", "GBP"]),
});

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
}

interface ResearchSource {
  title: string;
  url: string;
  sourceType: "vendor" | "directory" | "market-guide" | "google-places";
  observedPrice: number | null;
  note: string;
}

interface ResearchReference {
  lowTotal: number;
  medianTotal: number;
  highTotal: number;
  medianPerGuest: number;
  confidence: number;
  summary: string;
  sources: ResearchSource[];
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  throw new Error("OpenAI returned no market research output.");
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function collectWebSearchUrls(payload: Record<string, unknown>) {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string") {
      const normalized = normalizeUrl(record.url);
      if (normalized) urls.add(normalized);
    }
    Object.values(record).forEach(visit);
  };
  visit(payload.output);
  return urls;
}

function validatedReference(
  raw: ResearchReference,
  places: GooglePlace[],
  webSearchUrls: Set<string>,
) {
  const placeUrls = new Set(
    places
      .flatMap((place) => [place.websiteUri, place.googleMapsUri])
      .filter((url): url is string => Boolean(url))
      .map(normalizeUrl),
  );
  const allowedUrls = new Set([...placeUrls, ...webSearchUrls]);
  const sources = Array.isArray(raw.sources)
    ? raw.sources.filter((source) => allowedUrls.has(normalizeUrl(source.url)))
    : [];
  const priceSourceCount = sources.filter(
    (source) => typeof source.observedPrice === "number" && source.observedPrice > 0,
  ).length;

  if (
    !Number.isFinite(raw.lowTotal) ||
    !Number.isFinite(raw.medianTotal) ||
    !Number.isFinite(raw.highTotal) ||
    raw.lowTotal <= 0 ||
    raw.lowTotal > raw.medianTotal ||
    raw.medianTotal > raw.highTotal
  ) {
    throw new Error("The live research did not produce a valid ordered market range.");
  }
  if (!sources.length || priceSourceCount === 0) {
    throw new Error("No verifiable public catering price evidence was found for this brief.");
  }

  const evidenceConfidenceCap = priceSourceCount >= 3 ? 0.9 : priceSourceCount === 2 ? 0.7 : 0.45;
  return {
    ...raw,
    confidence: Math.min(Math.max(raw.confidence, 0), evidenceConfidenceCap),
    sources,
    sampleSize: priceSourceCount,
    status: "complete" as const,
    researchedAt: new Date().toISOString(),
  };
}

async function researchMarket(request: Request) {
  try {
    const payload = (await request.json()) as { brief?: unknown };
    const brief = briefSchema.parse(payload.brief);
    const googleKey = process.env.GOOGLE_PLACES_API_KEY;
    const openAIKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";
    if (!googleKey || !openAIKey) {
      return Response.json(
        { error: "Market research needs GOOGLE_PLACES_API_KEY and OPENAI_API_KEY on the server." },
        { status: 503 },
      );
    }

    const placesResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({
        textQuery: `${brief.serviceStyle} event catering services within ${brief.radiusKm} km of ${brief.city}`,
        pageSize: 12,
        languageCode: "en",
        includePureServiceAreaBusinesses: true,
      }),
    });
    if (!placesResponse.ok) {
      throw new Error(`Google Places failed (${placesResponse.status}).`);
    }
    const placesPayload = (await placesResponse.json()) as { places?: GooglePlace[] };
    const places = placesPayload.places ?? [];
    if (!places.length) throw new Error("Google Places found no relevant caterers in this area.");

    const candidates = places
      .map(
        (place) =>
          `- ${place.displayName?.text ?? "Unknown caterer"}; ${place.formattedAddress ?? "address unavailable"}; ${place.websiteUri ?? place.googleMapsUri ?? "website unavailable"}; rating ${place.rating ?? "n/a"} (${place.userRatingCount ?? 0} reviews)`,
      )
      .join("\n");
    const researchPrompt = `Create an evidence-backed catering market benchmark for this confirmed event brief.

Location: ${brief.city}, search radius ${brief.radiusKm} km
Venue: ${brief.venueAddress || "not specified"}
Event: ${brief.eventType} on ${brief.eventDate}
Guests: ${brief.guestCount}
Service: ${brief.serviceStyle}
Menu: ${brief.menuPreference}
Dietary and allergy requirements: ${brief.dietaryRequirements}
Staffing duration: ${brief.staffingHours || "not specified"} hours
Currency: ${brief.currency}

Google Places discovered these local candidates:
${candidates}

Use web search to inspect current public vendor menus, rate cards, event packages, credible directories, and regional pricing guides. Prefer sources near the event location and comparable in service style. Google Places is vendor discovery only; ratings are not price quotes.

Calculate a realistic all-in low, median, and high total covering food, staffing, delivery, equipment or tableware, setup or cleanup, service charges, and tax where applicable. Each source with an observed price must put the numeric price in observedPrice and describe its unit or basis in note. Use null when a source identifies a vendor but publishes no price. Include only URLs actually found through web search or supplied in the Google Places candidate list. If fewer than one verifiable public price is found, do not invent a range.`;

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        tools: [{ type: "web_search" }],
        input: researchPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "catering_market_reference",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "lowTotal",
                "medianTotal",
                "highTotal",
                "medianPerGuest",
                "confidence",
                "summary",
                "sources",
              ],
              properties: {
                lowTotal: { type: "number" },
                medianTotal: { type: "number" },
                highTotal: { type: "number" },
                medianPerGuest: { type: "number" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                summary: { type: "string" },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "url", "sourceType", "observedPrice", "note"],
                    properties: {
                      title: { type: "string" },
                      url: { type: "string" },
                      sourceType: {
                        type: "string",
                        enum: ["vendor", "directory", "market-guide", "google-places"],
                      },
                      observedPrice: { type: ["number", "null"] },
                      note: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!openAIResponse.ok) {
      throw new Error(`OpenAI web research failed (${openAIResponse.status}).`);
    }
    const openAIPayload = (await openAIResponse.json()) as Record<string, unknown>;
    const reference = JSON.parse(extractOutputText(openAIPayload)) as ResearchReference;
    return Response.json(
      validatedReference(reference, places, collectWebSearchUrls(openAIPayload)),
    );
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "The confirmed brief is incomplete. Return to intake and fill the required fields."
        : error instanceof Error
          ? error.message
          : "Market research failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/market-research")({
  server: {
    handlers: {
      POST: ({ request }) => researchMarket(request),
    },
  },
});
