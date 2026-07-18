import type { CateringBrief, MarketReference } from "../domain";
import type { MarketResearchProgress } from "./market-research-progress";

type ResearchStreamEvent =
  | { type: "progress"; progress: MarketResearchProgress }
  | { type: "complete"; reference: MarketReference }
  | { type: "error"; error: string };

function parseResearchEvent(line: string) {
  return JSON.parse(line) as ResearchStreamEvent;
}

export async function researchMarket(
  brief: CateringBrief,
  onProgress?: (progress: MarketResearchProgress) => void,
): Promise<MarketReference> {
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

  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    return (await response.json()) as MarketReference;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completedReference: MarketReference | undefined;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = parseResearchEvent(line);
    if (event.type === "progress") onProgress?.(event.progress);
    if (event.type === "complete") completedReference = event.reference;
    if (event.type === "error") throw new Error(event.error);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
    if (done) break;
  }
  handleLine(buffer);

  if (!completedReference) {
    throw new Error("Market research ended before producing a benchmark.");
  }
  return completedReference;
}
