export const marketResearchStages = [
  { id: "brief", label: "Confirming research scope" },
  { id: "places", label: "Finding relevant local caterers" },
  { id: "pricing", label: "Searching public pricing evidence" },
  { id: "evidence", label: "Verifying sources and price claims" },
  { id: "benchmark", label: "Calculating the market benchmark" },
] as const;

export type MarketResearchStage = (typeof marketResearchStages)[number]["id"];

export interface MarketResearchProgress {
  stage: MarketResearchStage;
  message: string;
  detail: string;
}
