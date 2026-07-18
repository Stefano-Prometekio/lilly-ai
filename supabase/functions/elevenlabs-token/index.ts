const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { agentId, participantName } = (await request.json()) as {
      agentId?: string;
      participantName?: string;
    };
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey || !agentId) throw new Error("Missing ELEVENLABS_API_KEY or agentId");

    const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
    url.searchParams.set("agent_id", agentId);
    url.searchParams.set("environment", "production");
    if (participantName) url.searchParams.set("participant_name", participantName);

    const response = await fetch(url, { headers: { "xi-api-key": apiKey } });
    if (!response.ok) throw new Error(`ElevenLabs token request failed: ${await response.text()}`);
    const payload = await response.json();

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
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
