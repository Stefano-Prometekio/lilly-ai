const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BriefPayload {
  eventType: string;
  eventDate: string;
  city: string;
  guestCount: number;
  serviceStyle: string;
  menuPreference: string;
  dietaryRequirements: string;
  radiusKm: number;
  currency: string;
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
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
  throw new Error("OpenAI response did not contain text output");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { brief } = (await request.json()) as { brief: BriefPayload };
    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const openAIKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.6-terra";
    if (!googleKey || !openAIKey)
      throw new Error("Missing GOOGLE_PLACES_API_KEY or OPENAI_API_KEY");

    const placesResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({
        textQuery: `event caterers near ${brief.city}`,
        pageSize: 10,
        languageCode: "en",
        includePureServiceAreaBusinesses: true,
      }),
    });
    if (!placesResponse.ok) throw new Error(`Google Places failed: ${await placesResponse.text()}`);
    const placesPayload = (await placesResponse.json()) as { places?: GooglePlace[] };
    const places = placesPayload.places ?? [];

    const researchPrompt = `Research a realistic event-catering market price range for this exact brief:
- Location: ${brief.city}, within ${brief.radiusKm} km
- Event: ${brief.eventType} on ${brief.eventDate}
- Guests: ${brief.guestCount}
- Service: ${brief.serviceStyle}
- Menu: ${brief.menuPreference}
- Dietary/safety: ${brief.dietaryRequirements}
- Currency: ${brief.currency}

Google Places candidates:
${places.map((place) => `- ${place.displayName?.text ?? "Unknown"}: ${place.websiteUri ?? place.googleMapsUri ?? "no URL"} (${place.formattedAddress ?? "no address"})`).join("\n")}

Use current public web sources. Prefer vendor rate cards, menus, wedding/event pricing pages, and credible regional market guides. Do not treat Google rating price levels as quotes. Estimate a low, median, and high all-in total for comparable scope, explicitly accounting for food, staffing, delivery, tableware, and tax. Return only the requested JSON. Every market price observation must have a source URL. If direct prices are sparse, lower confidence and say so.`;

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIKey}`, "Content-Type": "application/json" },
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
                    required: ["title", "url", "sourceType", "note", "observedPrice"],
                    properties: {
                      title: { type: "string" },
                      url: { type: "string" },
                      sourceType: {
                        type: "string",
                        enum: ["vendor", "directory", "market-guide", "google-places"],
                      },
                      note: { type: "string" },
                      observedPrice: { type: ["number", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!openAIResponse.ok)
      throw new Error(`OpenAI research failed: ${await openAIResponse.text()}`);
    const openAIPayload = (await openAIResponse.json()) as Record<string, unknown>;
    const reference = JSON.parse(extractOutputText(openAIPayload));

    return new Response(
      JSON.stringify({
        ...reference,
        status: "complete",
        sampleSize: reference.sources.length,
        researchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
