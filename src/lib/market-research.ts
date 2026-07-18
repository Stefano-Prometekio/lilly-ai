import type { CateringBrief, MarketReference } from "../domain";
import { fallbackMarketReference } from "./procurement";

export async function researchMarket(brief: CateringBrief): Promise<MarketReference> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    return fallbackMarketReference(brief);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/market-baseline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({ brief }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Market research failed");
  }

  return (await response.json()) as MarketReference;
}
