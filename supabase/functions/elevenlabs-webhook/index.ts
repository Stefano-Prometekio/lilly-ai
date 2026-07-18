interface TranscriptTurn {
  role?: string;
  message?: string;
  time_in_call_secs?: number;
  tool_calls?: unknown;
  tool_results?: unknown;
}

interface WebhookEvent {
  type: "post_call_transcription" | "post_call_audio" | "call_initiation_failure";
  event_timestamp: number;
  data: Record<string, unknown> & {
    agent_id?: string;
    conversation_id?: string;
    status?: string;
    version_id?: string;
    transcript?: TranscriptTurn[];
    analysis?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    full_audio?: string;
    failure_reason?: string;
    has_audio?: boolean;
    conversation_initiation_client_data?: Record<string, unknown>;
  };
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return constantTimeEqual(bytesToHex(digest), signature);
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing");
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
      ...(init.headers ?? {}),
    },
  });
}

function getDynamicVariables(data: WebhookEvent["data"]) {
  const initiation = data.conversation_initiation_client_data;
  if (!initiation || typeof initiation !== "object") return {};
  const variables = initiation.dynamic_variables;
  return variables && typeof variables === "object" ? (variables as Record<string, unknown>) : {};
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await request.text();
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (
    !secret ||
    !(await verifySignature(rawBody, request.headers.get("elevenlabs-signature"), secret))
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody) as WebhookEvent;
    const data = event.data;
    const conversationId = String(data.conversation_id ?? "");
    if (!conversationId) throw new Error("Missing conversation_id");
    const dynamic = getDynamicVariables(data);
    const callSessionId = String(dynamic.call_session_id ?? conversationId);

    if (event.type === "post_call_transcription") {
      const analysis = data.analysis ?? {};
      const summary =
        typeof analysis.transcript_summary === "string" ? analysis.transcript_summary : null;
      const callRow = {
        id: callSessionId,
        campaign_id: dynamic.campaign_id ?? null,
        vendor_id: dynamic.vendor_id ?? null,
        brief_version: dynamic.brief_version ? Number(dynamic.brief_version) : null,
        mode: dynamic.call_mode ?? "INITIAL_QUOTE",
        status: data.status ?? "done",
        elevenlabs_conversation_id: conversationId,
        elevenlabs_agent_id: data.agent_id ?? null,
        elevenlabs_version_id: data.version_id ?? null,
        transcript: data.transcript ?? [],
        analysis,
        metadata: data.metadata ?? {},
        summary,
        has_audio: data.has_audio ?? false,
        completed_at: new Date(event.event_timestamp * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      const callResponse = await supabaseRequest("/rest/v1/call_sessions?on_conflict=id", {
        method: "POST",
        body: JSON.stringify(callRow),
      });
      if (!callResponse.ok) throw new Error(`Call upsert failed: ${await callResponse.text()}`);

      const turns = (data.transcript ?? []).map((turn, turnIndex) => ({
        call_session_id: callSessionId,
        turn_index: turnIndex,
        role: turn.role ?? "unknown",
        message: turn.message ?? "",
        time_in_call_secs: turn.time_in_call_secs ?? null,
        tool_calls: turn.tool_calls ?? null,
        tool_results: turn.tool_results ?? null,
      }));
      if (turns.length > 0) {
        const turnResponse = await supabaseRequest(
          "/rest/v1/transcript_turns?on_conflict=call_session_id,turn_index",
          {
            method: "POST",
            body: JSON.stringify(turns),
          },
        );
        if (!turnResponse.ok)
          throw new Error(`Transcript upsert failed: ${await turnResponse.text()}`);
      }
    }

    if (event.type === "post_call_audio" && data.full_audio) {
      const binary = Uint8Array.from(atob(data.full_audio), (character) => character.charCodeAt(0));
      const audioPath = `${conversationId}.mp3`;
      const upload = await supabaseRequest(`/storage/v1/object/call-audio/${audioPath}`, {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg", "x-upsert": "true" },
        body: binary,
      });
      if (!upload.ok) throw new Error(`Audio upload failed: ${await upload.text()}`);
      await supabaseRequest(`/rest/v1/call_sessions?id=eq.${encodeURIComponent(callSessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          audio_path: audioPath,
          has_audio: true,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    if (event.type === "call_initiation_failure") {
      await supabaseRequest("/rest/v1/call_sessions?on_conflict=id", {
        method: "POST",
        body: JSON.stringify({
          id: callSessionId,
          status: "failed",
          elevenlabs_conversation_id: conversationId,
          elevenlabs_agent_id: data.agent_id ?? null,
          failure_reason: data.failure_reason ?? "unknown",
          metadata: data.metadata ?? {},
          completed_at: new Date(event.event_timestamp * 1000).toISOString(),
        }),
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
