import { readFile, writeFile } from "node:fs/promises";
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

async function loadLocalEnv() {
  try {
    return parseEnv(await readFile(envPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
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
    const message = body?.detail?.message ?? body?.detail ?? body?.message ?? text;
    throw new Error(
      `ElevenLabs ${response.status}: ${typeof message === "string" ? message : JSON.stringify(message)}`,
    );
  }

  return body;
}

function voiceScore(voice) {
  const labels = Object.fromEntries(
    Object.entries(voice.labels ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      String(value).toLowerCase(),
    ]),
  );
  const haystack = [voice.name, voice.description, ...Object.values(labels)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (labels.gender === "female" || /\bfemale\b/.test(haystack)) score += 100;
  if (labels.accent === "american" || /\bamerican\b/.test(haystack)) score += 80;
  if (/professional|warm|calm|conversational|knowledgeable|friendly|empathetic/.test(haystack))
    score += 25;
  if (/young|middle-aged|middle aged/.test(haystack)) score += 5;
  if (voice.category === "premade" || voice.category === "professional") score += 5;
  if (voice.name === "Alexandra") score += 20;
  return score;
}

function selectVoice(voices) {
  const ranked = [...voices].sort((a, b) => voiceScore(b) - voiceScore(a));
  const selected = ranked[0];
  if (!selected || voiceScore(selected) < 180) {
    throw new Error("No suitable female American English voice was available to this account.");
  }
  return selected;
}

async function upsertLocalEnv(values) {
  let source = "";
  try {
    source = await readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const lines = source ? source.split(/\r?\n/) : [];
  for (const [name, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    const nextLine = `${name}=${value}`;
    if (index >= 0) lines[index] = nextLine;
    else lines.push(nextLine);
  }

  const normalized = `${lines.filter(Boolean).join("\n")}\n`;
  await writeFile(envPath, normalized, { encoding: "utf8", mode: 0o600 });
}

async function main() {
  const env = await loadLocalEnv();
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ELEVENLABS_API_KEY in .env.local. Add it there, then rerun this command.",
    );
  }

  const existingAgentId =
    env.ELEVENLABS_PROCUREMENT_AGENT_ID ?? env.VITE_ELEVENLABS_PROCUREMENT_AGENT_ID;
  if (existingAgentId) {
    throw new Error(
      `Lilly is already configured as ${existingAgentId}. Remove the four agent ID entries from .env.local only if you intentionally want to create a replacement.`,
    );
  }

  const prompt = await readFile(promptPath, "utf8");
  const voicesResponse = await apiRequest(
    "/v2/voices?page_size=100&voice_type=default&include_total_count=false",
    apiKey,
  );
  const voice = selectVoice(voicesResponse.voices ?? []);

  const created = await apiRequest("/v1/convai/agents/create", apiKey, {
    method: "POST",
    body: JSON.stringify({
      name: "Lilly — Procurement Partner",
      tags: ["hackathon", "catering", "procurement", "event-planning"],
      conversation_config: {
        agent: {
          first_message:
            "Hello, I'm Lilly, your AI procurement partner in event planning. How can I help today?",
          language: "en",
          prompt: {
            prompt,
          },
        },
        tts: {
          voice_id: voice.voice_id,
          speed: 1,
          stability: 0.58,
          similarity_boost: 0.8,
        },
      },
    }),
  });

  const agentId = created.agent_id;
  if (!agentId) throw new Error("ElevenLabs created the agent but did not return an agent_id.");

  const verified = await apiRequest(`/v1/convai/agents/${encodeURIComponent(agentId)}`, apiKey);
  if (verified.agent_id && verified.agent_id !== agentId) {
    throw new Error("The created agent could not be verified.");
  }

  await upsertLocalEnv({
    ELEVENLABS_INTAKE_AGENT_ID: agentId,
    ELEVENLABS_PROCUREMENT_AGENT_ID: agentId,
    VITE_ELEVENLABS_INTAKE_AGENT_ID: agentId,
    VITE_ELEVENLABS_PROCUREMENT_AGENT_ID: agentId,
  });

  console.log(`Created Lilly agent: ${agentId}`);
  console.log(`Selected voice: ${voice.name} (${voice.voice_id})`);
  console.log(
    "Configured the same agent ID for intake, initial quote, and negotiation modes in .env.local.",
  );
}

main().catch((error) => {
  console.error(error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message);
  process.exitCode = 1;
});
