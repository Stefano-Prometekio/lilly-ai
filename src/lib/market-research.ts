import type { CateringBrief, MarketReference } from "../domain";

export async function researchMarket(brief: CateringBrief): Promise<MarketReference> {
  const response = await fetch("/api/market-research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: string }
      | undefined;
    throw new Error(payload?.error || "Live market research failed.");
  }

  return (await response.json()) as MarketReference;
}
