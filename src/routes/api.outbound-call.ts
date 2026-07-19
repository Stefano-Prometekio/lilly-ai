import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  toNumber: z.string().min(6),
  dynamicVariables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  agentId: z.string().optional(),
  phoneNumberId: z.string().optional(),
});

export const Route = createFileRoute("/api/outbound-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        const defaultAgentId = process.env.ELEVENLABS_PROCUREMENT_AGENT_ID;
        const defaultPhoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

        if (!apiKey) {
          return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
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

        const agentId = parsed.agentId ?? defaultAgentId;
        const phoneNumberId = parsed.phoneNumberId ?? defaultPhoneNumberId;
        if (!agentId || !phoneNumberId) {
          return Response.json(
            { error: "Missing agent_id or agent_phone_number_id" },
            { status: 500 },
          );
        }

        // Coerce all dynamic variables to strings (ElevenLabs requires string values)
        const dynamicVariables: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.dynamicVariables ?? {})) {
          dynamicVariables[k] = String(v);
        }

        const vendorName = dynamicVariables.vendor_name || "the catering team";
        const canonicalJson = dynamicVariables.canonical_brief_json;
        const briefHash = dynamicVariables.brief_hash;
        if (!canonicalJson || !briefHash || !dynamicVariables.brief_version) {
          return Response.json(
            { error: "A frozen canonical brief JSON, hash, and version are required." },
            { status: 400 },
          );
        }
        let eventSummary = "the exact confirmed catering brief";
        try {
          const canonical = JSON.parse(canonicalJson) as {
            eventType?: string;
            eventDate?: string;
            city?: string;
            guestCount?: number;
            serviceStyle?: string;
          };
          eventSummary = `${canonical.eventType}, ${canonical.eventDate}, ${canonical.city}, ${canonical.guestCount} guests, ${canonical.serviceStyle}`;
        } catch {
          return Response.json({ error: "canonical_brief_json is invalid JSON." }, { status: 400 });
        }
        const firstMessage = `Hi, this is Lilly, an AI procurement assistant calling on behalf of an event buyer. Am I reaching ${vendorName}? I'm gathering a catering quote for ${eventSummary} and hoping you have a couple of minutes to walk through it.`;

        const payload = {
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: parsed.toNumber,
          conversation_initiation_client_data: {
            dynamic_variables: dynamicVariables,
            conversation_config_override: {
              agent: {
                first_message: firstMessage,
              },
            },
          },
        };

        const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }

        if (!res.ok) {
          console.error("[outbound-call] ElevenLabs error", res.status, text);
          return Response.json(
            { error: "ElevenLabs call failed", status: res.status, detail: json },
            { status: 502 },
          );
        }

        return Response.json({ ok: true, result: json });
      },
    },
  },
});
