import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  conversationId: z.string().min(4),
  currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
});

interface TranscriptTurn {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number;
}

const EXTRACT_SCHEMA = {
  name: "structured_quote",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      outcomeKind: {
        type: "string",
        enum: ["itemized_quote", "callback_commitment", "documented_decline"],
      },
      summary: { type: "string" },
      headlineTotal: { type: "number" },
      components: {
        type: "object",
        additionalProperties: false,
        properties: {
          foodAndBeverage: { type: "number" },
          staffing: { type: "number" },
          delivery: { type: "number" },
          tableware: { type: "number" },
          tax: { type: "number" },
          other: { type: "number" },
        },
        required: ["foodAndBeverage", "staffing", "delivery", "tableware", "tax", "other"],
      },
      depositPercent: { type: "number" },
      cancellationDays: { type: "number" },
      validUntilDays: { type: "number" },
      callbackAt: { type: ["string", "null"] },
      notes: { type: "string" },
      readBackConfirmed: { type: "boolean" },
    },
    required: [
      "outcomeKind",
      "summary",
      "headlineTotal",
      "components",
      "depositPercent",
      "cancellationDays",
      "validUntilDays",
      "callbackAt",
      "notes",
      "readBackConfirmed",
    ],
  },
  strict: true,
};

export const Route = createFileRoute("/api/extract-quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log("[extract-quote] request received");
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!elevenKey || !openaiKey) {
          return Response.json(
            { error: "Missing ELEVENLABS_API_KEY or OPENAI_API_KEY" },
            { status: 500 },
          );
        }

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch (e) {
          return Response.json(
            { error: "Invalid request", detail: (e as Error).message },
            { status: 400 },
          );
        }

        const convRes = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${parsed.conversationId}`,
          { headers: { "xi-api-key": elevenKey } },
        );
        if (!convRes.ok) {
          const text = await convRes.text();
          const retryable = [404, 409, 425, 429, 500, 502, 503, 504].includes(convRes.status);
          console.warn("[extract-quote] conversation is not available", {
            conversationId: parsed.conversationId,
            status: convRes.status,
            retryable,
          });
          return Response.json(
            {
              error: "ElevenLabs conversation fetch failed",
              status: convRes.status,
              detail: text,
              retryable,
            },
            { status: retryable ? 425 : 502 },
          );
        }
        const conv = (await convRes.json()) as {
          transcript?: TranscriptTurn[];
          status?: string;
          metadata?: { call_duration_secs?: number; termination_reason?: string };
        };
        const turns = (conv.transcript ?? [])
          .filter((t) => t.message)
          .map((t) => `${t.role ?? "unknown"}: ${t.message}`)
          .join("\n");

        if (!turns.trim()) {
          console.log("[extract-quote] transcript is still processing", {
            conversationId: parsed.conversationId,
            conversationStatus: conv.status ?? "unknown",
          });
          return Response.json(
            {
              error: "The post-call transcript is still being prepared",
              retryable: true,
              conversationStatus: conv.status ?? "unknown",
            },
            { status: 425 },
          );
        }

        console.log("[extract-quote] transcript ready", {
          conversationId: parsed.conversationId,
          turnCount: conv.transcript?.length ?? 0,
        });

        const systemPrompt = `You extract a structured catering vendor quote from a phone-call transcript between "Lilly" (an AI event-planning assistant) and a catering vendor.

Return JSON matching the schema. Guidance:
- outcomeKind: "itemized_quote" if a total price was quoted (even approximate/high-level with a breakdown), "callback_commitment" if the vendor promised to call back or email a proposal, "documented_decline" otherwise.
- headlineTotal: the all-in total in ${parsed.currency}. 0 if not given.
- components: best-effort split in ${parsed.currency}. If vendor gave a percentage split ("60% food, 40% staffing"), apply it to the headlineTotal. Put anything unclassified in "other". Use 0 for unmentioned buckets. Values should sum to roughly headlineTotal when a total exists.
- depositPercent: number 0-100. 0 if unknown.
- cancellationDays: notice days for full refund. 0 if unknown.
- validUntilDays: quote validity in days from today. 0 if unknown (e.g., "4 weeks" -> 28).
- callbackAt: ISO datetime if a specific callback was promised, else null. Assume "tomorrow 9am" is tomorrow in Europe/London 09:00.
- notes: 1-3 sentence summary including any caveats (email follow-up needed, overtime fee, etc).
- readBackConfirmed: true only if Lilly explicitly read the whole offer back and the vendor confirmed.

Do not invent numbers. If a component is unknown, use 0.`;

        const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `Today: ${new Date().toISOString()}\n\nTranscript:\n${turns}`,
              },
            ],
            response_format: { type: "json_schema", json_schema: EXTRACT_SCHEMA },
          }),
        });

        if (!oaiRes.ok) {
          const text = await oaiRes.text();
          const retryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(oaiRes.status);
          console.error("[extract-quote] OpenAI extraction failed", {
            conversationId: parsed.conversationId,
            status: oaiRes.status,
            retryable,
          });
          return Response.json(
            {
              error: "OpenAI extraction failed",
              status: oaiRes.status,
              detail: text,
              retryable,
            },
            { status: retryable ? 503 : 502 },
          );
        }
        const oaiJson = (await oaiRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = oaiJson.choices?.[0]?.message?.content;
        if (!content) {
          return Response.json({ error: "OpenAI returned no content" }, { status: 502 });
        }
        let extracted;
        try {
          extracted = JSON.parse(content);
        } catch (e) {
          return Response.json(
            { error: "Extraction JSON parse failed", detail: (e as Error).message, raw: content },
            { status: 502 },
          );
        }

        console.log("[extract-quote] quote extracted", {
          conversationId: parsed.conversationId,
          outcomeKind: (extracted as { outcomeKind?: unknown }).outcomeKind ?? "unknown",
        });
        return Response.json({
          ok: true,
          extracted,
          metadata: {
            conversationId: parsed.conversationId,
            durationSecs: conv.metadata?.call_duration_secs ?? null,
            terminationReason: conv.metadata?.termination_reason ?? null,
          },
        });
      },
    },
  },
});
