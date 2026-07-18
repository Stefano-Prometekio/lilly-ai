import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/call-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
        }
        const url = new URL(request.url);
        const conversationId = url.searchParams.get("conversation_id");
        if (!conversationId) {
          return Response.json({ error: "conversation_id required" }, { status: 400 });
        }

        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
          { headers: { "xi-api-key": apiKey } },
        );
        const text = await res.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
        if (!res.ok) {
          return Response.json(
            { error: "ElevenLabs status failed", status: res.status, detail: json },
            { status: 502 },
          );
        }
        return Response.json(json);
      },
    },
  },
});
