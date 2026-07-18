import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const envPath = resolve(root, ".env.local");
const promptPath = resolve(root, "elevenlabs/prompts/lilly-agent.md");

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function apiRequest(path, apiKey, options = {}) {
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      ...options.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }
  if (!response.ok) {
    const detail = body?.detail?.message ?? body?.detail ?? body?.message ?? text;
    throw new Error(
      `ElevenLabs ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
  return body;
}

const briefFieldProperties = {
  eventType: { type: "string", description: "The buyer's event type." },
  eventDate: { type: "string", description: "The event date in YYYY-MM-DD format." },
  city: { type: "string", description: "The city and country or venue area." },
  venueAddress: { type: "string", description: "The venue address, when known." },
  guestCount: { type: "number", description: "The confirmed number of guests." },
  serviceStyle: { type: "string", description: "The requested catering service style." },
  menuPreference: { type: "string", description: "The requested menu or cuisine." },
  dietaryRequirements: {
    type: "string",
    description: "Dietary, allergy, and food-safety requirements; use 'none' only if stated.",
  },
  staffingHours: { type: "number", description: "Requested staffing duration in hours." },
  targetBudget: { type: "number", description: "The buyer's target total budget." },
  absoluteMaximum: { type: "number", description: "The buyer's absolute maximum total budget." },
  radiusKm: { type: "number", description: "Vendor search radius in kilometers." },
  currency: { type: "string", enum: ["EUR", "USD", "GBP"], description: "Budget currency." },
  mayUseVerifiedLeverage: {
    type: "boolean",
    description: "Whether Lilly may cite verified competing offers without naming vendors.",
  },
  mayDiscloseTargetBudget: {
    type: "boolean",
    description: "Whether Lilly may disclose the target budget.",
  },
};

const intakeTools = [
  {
    name: "record_brief_fields",
    description:
      "Update the visible browser brief immediately after the buyer supplies or corrects one or more facts. Call this before asking the next question.",
    parameters: {
      type: "object",
      required: ["fields"],
      properties: {
        fields: {
          type: "object",
          description: "Only the fields explicitly supplied or corrected in the latest answer.",
          properties: briefFieldProperties,
        },
      },
    },
  },
  {
    name: "get_intake_state",
    description:
      "Read the current visible draft and missing fields before selecting the next single intake question.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "mark_intake_ready_for_review",
    description:
      "Check whether the visible brief has every critical field and is ready for the buyer's review.",
    parameters: { type: "object", properties: {} },
  },
];

function toolConfig(tool) {
  return {
    type: "client",
    name: tool.name,
    description: tool.description,
    expects_response: true,
    execution_mode: "immediate",
    response_timeout_secs: 10,
    parameters: tool.parameters,
  };
}

async function upsertTool(tool, tools, apiKey) {
  const existing = tools.find((candidate) => candidate.tool_config?.name === tool.name);
  if (existing) {
    await apiRequest(`/v1/convai/tools/${encodeURIComponent(existing.id)}`, apiKey, {
      method: "PATCH",
      body: JSON.stringify({ tool_config: toolConfig(tool) }),
    });
    return existing.id;
  }
  const created = await apiRequest("/v1/convai/tools", apiKey, {
    method: "POST",
    body: JSON.stringify({ tool_config: toolConfig(tool) }),
  });
  if (!created.id) throw new Error(`ElevenLabs did not return an ID for ${tool.name}.`);
  return created.id;
}

async function main() {
  const env = parseEnv(await readFile(envPath, "utf8"));
  const apiKey = env.ELEVENLABS_API_KEY;
  const agentId = env.ELEVENLABS_PROCUREMENT_AGENT_ID ?? env.VITE_ELEVENLABS_PROCUREMENT_AGENT_ID;
  if (!apiKey || !agentId)
    throw new Error("Missing ElevenLabs API key or Lilly agent ID in .env.local.");

  const prompt = await readFile(promptPath, "utf8");
  const toolsPayload = await apiRequest(
    "/v1/convai/tools?page_size=100&types=client&sort_by=name&sort_direction=asc",
    apiKey,
  );
  const existingTools = Array.isArray(toolsPayload.tools) ? toolsPayload.tools : [];
  const toolIds = [];
  for (const tool of intakeTools) toolIds.push(await upsertTool(tool, existingTools, apiKey));

  const agent = await apiRequest(`/v1/convai/agents/${encodeURIComponent(agentId)}`, apiKey);
  const existingToolIds = agent.conversation_config?.agent?.prompt?.tool_ids ?? [];
  const mergedToolIds = [...new Set([...existingToolIds, ...toolIds])];
  await apiRequest(`/v1/convai/agents/${encodeURIComponent(agentId)}`, apiKey, {
    method: "PATCH",
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            prompt,
            tool_ids: mergedToolIds,
          },
        },
      },
    }),
  });

  const verified = await apiRequest(`/v1/convai/agents/${encodeURIComponent(agentId)}`, apiKey);
  const verifiedToolIds = verified.conversation_config?.agent?.prompt?.tool_ids ?? [];
  if (!toolIds.every((id) => verifiedToolIds.includes(id))) {
    throw new Error("Lilly was updated, but the intake tools could not be verified on the agent.");
  }

  console.log(`Updated Lilly: ${agentId}`);
  console.log(`Attached intake tools: ${intakeTools.map((tool) => tool.name).join(", ")}`);
  console.log("Applied the strict one-question-per-turn intake prompt.");
}

main().catch((error) => {
  console.error(error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message);
  process.exitCode = 1;
});
