const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lilly-tool-secret",
};

const requiredQuoteFacts = [
  "headline_total",
  "food_and_beverage",
  "staffing",
  "delivery",
  "tableware",
  "tax_and_service_fees",
  "deposit",
  "cancellation",
  "quote_validity",
];

async function db(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service configuration is missing");
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
      ...(init.headers ?? {}),
    },
  });
}

async function parseJson(response: Response) {
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function ensureCallContext(body: Record<string, unknown>) {
  const campaignId = String(body.campaign_id ?? "");
  const callSessionId = String(body.call_session_id ?? "");
  const vendorId = String(body.vendor_id ?? "");
  if (!campaignId || !callSessionId)
    throw new Error("campaign_id and call_session_id are required");

  await parseJson(
    await db("/rest/v1/campaigns?on_conflict=id", {
      method: "POST",
      body: JSON.stringify({ id: campaignId, status: "gathering_quotes" }),
    }),
  );
  if (vendorId) {
    await parseJson(
      await db("/rest/v1/vendors?on_conflict=id", {
        method: "POST",
        body: JSON.stringify({
          id: vendorId,
          campaign_id: campaignId,
          name: body.vendor_name ?? vendorId,
        }),
      }),
    );
  }
  await parseJson(
    await db("/rest/v1/call_sessions?on_conflict=id", {
      method: "POST",
      body: JSON.stringify({
        id: callSessionId,
        campaign_id: campaignId,
        vendor_id: vendorId || null,
        brief_version: Number(body.brief_version ?? 1),
        mode: body.call_mode ?? "INITIAL_QUOTE",
        status: "in_progress",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }),
  );
}

function routeName(request: Request) {
  return new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (request.headers.get("x-lilly-tool-secret") !== Deno.env.get("LILLY_AGENT_TOOL_SECRET")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const route = routeName(request);
    const body = (await request.json()) as Record<string, unknown>;

    if (route === "record-brief-fields") {
      const campaignId = String(body.campaign_id ?? "");
      const version = Number(body.brief_version ?? 1);
      const fields =
        body.fields && typeof body.fields === "object"
          ? (body.fields as Record<string, unknown>)
          : {};
      if (!campaignId) throw new Error("campaign_id is required");
      await parseJson(
        await db("/rest/v1/campaigns?on_conflict=id", {
          method: "POST",
          body: JSON.stringify({ id: campaignId, status: "draft" }),
        }),
      );
      const existing = (await parseJson(
        await db(
          `/rest/v1/brief_versions?campaign_id=eq.${encodeURIComponent(campaignId)}&version=eq.${version}&select=content&limit=1`,
        ),
      )) as Array<{ content: Record<string, unknown> }>;
      const content = { ...(existing[0]?.content ?? {}), ...fields };
      await parseJson(
        await db("/rest/v1/brief_versions?on_conflict=campaign_id,version", {
          method: "POST",
          body: JSON.stringify({ campaign_id: campaignId, version, status: "draft", content }),
        }),
      );
      return Response.json(
        { saved: true, known_fields: Object.keys(content) },
        { headers: corsHeaders },
      );
    }

    if (route === "get-intake-state" || route === "mark-intake-ready-for-review") {
      const campaignId = String(body.campaign_id ?? "");
      const version = Number(body.brief_version ?? 1);
      const rows = (await parseJson(
        await db(
          `/rest/v1/brief_versions?campaign_id=eq.${encodeURIComponent(campaignId)}&version=eq.${version}&select=content,status&limit=1`,
        ),
      )) as Array<{ content: Record<string, unknown>; status: string }>;
      const content = rows[0]?.content ?? {};
      const missing = [
        "eventType",
        "eventDate",
        "city",
        "guestCount",
        "serviceStyle",
        "dietaryRequirements",
        "targetBudget",
        "absoluteMaximum",
      ].filter((key) => content[key] == null || content[key] === "");
      if (route === "mark-intake-ready-for-review" && missing.length === 0) {
        await parseJson(
          await db(`/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "awaiting_user_confirmation",
              updated_at: new Date().toISOString(),
            }),
          }),
        );
      }
      return Response.json(
        { content, missing_required: missing, ready_for_review: missing.length === 0 },
        { headers: corsHeaders },
      );
    }

    if (route === "record-quote-fact") {
      await ensureCallContext(body);
      const response = await db("/rest/v1/evidence_items", {
        method: "POST",
        body: JSON.stringify({
          campaign_id: body.campaign_id,
          call_session_id: body.call_session_id,
          evidence_type: "live_transcript",
          fact_type: body.fact_type,
          fact_value: body.fact_value ?? {},
          confidence: Math.max(0, Math.min(1, Number(body.confidence ?? 0))),
          time_in_call_secs: body.time_in_call_secs ?? null,
          leverage_eligible: false,
        }),
      });
      const saved = (await parseJson(response)) as Array<{ id: string }>;
      return Response.json(
        { saved: true, evidence_id: saved[0]?.id, leverage_eligible: false },
        { headers: corsHeaders },
      );
    }

    if (route === "check-quote-completeness") {
      const callSessionId = String(body.call_session_id ?? "");
      const facts = (await parseJson(
        await db(
          `/rest/v1/evidence_items?call_session_id=eq.${encodeURIComponent(callSessionId)}&select=fact_type`,
        ),
      )) as Array<{ fact_type: string }>;
      const captured = new Set(facts.map((fact) => fact.fact_type));
      const missing = requiredQuoteFacts.filter((fact) => !captured.has(fact));
      return Response.json(
        {
          completeness: (requiredQuoteFacts.length - missing.length) / requiredQuoteFacts.length,
          missing,
          next_objective: missing[0] ?? "read_back_and_confirm",
        },
        { headers: corsHeaders },
      );
    }

    if (route === "get-call-context") {
      const callSessionId = String(body.call_session_id ?? "");
      const sessions = (await parseJson(
        await db(
          `/rest/v1/call_sessions?id=eq.${encodeURIComponent(callSessionId)}&select=*,campaigns(*),vendors(*)&limit=1`,
        ),
      )) as unknown[];
      const evidence = await parseJson(
        await db(
          `/rest/v1/evidence_items?call_session_id=eq.${encodeURIComponent(callSessionId)}&leverage_eligible=eq.true&select=id,fact_type,fact_value,confidence`,
        ),
      );
      return Response.json(
        {
          call: sessions[0] ?? null,
          permitted_claims: evidence ?? [],
          prohibited_disclosures: [
            "competitor_identity",
            "absolute_maximum_budget",
            "binding_commitment",
          ],
        },
        { headers: corsHeaders },
      );
    }

    if (route === "evaluate-counteroffer") {
      const currentTotal = Number(body.current_total ?? 0);
      const changes = Array.isArray(body.changes)
        ? (body.changes as Array<Record<string, unknown>>)
        : [];
      const scopeChange = Boolean(body.scope_change);
      const conditionalCommitment = body.conditional_commitment;
      if (scopeChange || conditionalCommitment) {
        return Response.json(
          {
            decision: "ESCALATE_TO_USER",
            acceptable: false,
            reason: scopeChange
              ? "scope_change_requires_authorization"
              : "conditional_commitment_requires_authorization",
          },
          { headers: corsHeaders },
        );
      }
      const delta = changes.reduce(
        (sum, change) => sum + Number(change.new_value ?? 0) - Number(change.previous_value ?? 0),
        0,
      );
      return Response.json(
        {
          decision: "SEEK_CONFIRMATION",
          acceptable: true,
          new_expected_total: currentTotal + delta,
          message_objective: "Confirm the changed component and read back the full offer",
        },
        { headers: corsHeaders },
      );
    }

    if (route === "finalize-call-outcome") {
      const allowed = new Set([
        "itemized_quote",
        "callback_commitment",
        "email_commitment",
        "decline",
      ]);
      const outcome = String(body.outcome ?? "");
      if (!allowed.has(outcome)) throw new Error("A structured outcome is required");
      await parseJson(
        await db(
          `/rest/v1/call_sessions?id=eq.${encodeURIComponent(String(body.call_session_id ?? ""))}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: outcome,
              analysis: { structured_outcome: outcome, details: body.details ?? {} },
              updated_at: new Date().toISOString(),
            }),
          },
        ),
      );
      return Response.json(
        { finalized: true, outcome, may_end_call: true },
        { headers: corsHeaders },
      );
    }

    throw new Error(`Unknown tool route: ${route}`);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
