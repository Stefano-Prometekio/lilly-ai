export const LILLY_PUBLIC_AGENT_ID = "agent_2601kxvhket0ff9s5qfyzh1pge54";

export async function getElevenLabsConversationToken(agentId: string, participantName: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return undefined;

  const response = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({ agentId, participantName }),
  });
  if (!response.ok) throw new Error(await response.text());
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) throw new Error("ElevenLabs did not return a conversation token");
  return payload.token;
}
