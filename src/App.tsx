import { useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronRight,
  FileSearch,
  Handshake,
  ListChecks,
  Mic2,
  Sparkles,
} from "lucide-react";
import type {
  CampaignStep,
  CateringBrief,
  MarketReference,
  NegotiationPlan,
  VendorQuote,
} from "./domain";
import { BriefForm } from "./components/BriefForm";
import { MarketResearch } from "./components/MarketResearch";
import { VendorCalls } from "./components/VendorCalls";
import { Comparison } from "./components/Comparison";
import { Negotiation } from "./components/Negotiation";
import { Recommendation } from "./components/Recommendation";
import {
  buildNegotiationPlan,
  emptyMarketReference,
  initialBrief,
  initialQuotes,
  normalizeQuote,
} from "./lib/procurement";
import { researchMarket } from "./lib/market-research";
import type { MarketResearchProgress } from "./lib/market-research-progress";
import { confirmCanonicalBrief } from "./lib/canonical-brief";
import { createDemoBrief, createDemoQuotes, demoMarketReference } from "./lib/demo-scenario";

const steps: Array<{ id: CampaignStep; label: string; icon: typeof Mic2 }> = [
  { id: "intake", label: "Plan your event", icon: Mic2 },
  { id: "research", label: "Scan the market", icon: FileSearch },
  { id: "calls", label: "Contact vendors", icon: ListChecks },
  { id: "compare", label: "Compare", icon: BarChart3 },
  { id: "negotiate", label: "Improve the offer", icon: Handshake },
  { id: "recommend", label: "Recommendation", icon: Sparkles },
];

const stepDescriptions: Record<CampaignStep, string> = {
  intake: "Build one clear event brief",
  research: "Understand local pricing",
  calls: "Collect comparable offers",
  compare: "Review value side by side",
  negotiate: "Ask for a better outcome",
  recommend: "Choose with confidence",
};

function App() {
  const [step, setStep] = useState<CampaignStep>("intake");
  const [brief, setBrief] = useState<CateringBrief>(initialBrief);
  const [marketReference, setMarketReference] = useState<MarketReference>(emptyMarketReference);
  const [quotes, setQuotes] = useState<VendorQuote[]>(initialQuotes);
  const [activeQuoteId, setActiveQuoteId] = useState<string>();
  const [finalistIds, setFinalistIds] = useState<string[]>([]);
  const [researchError, setResearchError] = useState<string>();
  const [researchProgress, setResearchProgress] = useState<MarketResearchProgress>();
  const [demoMode, setDemoMode] = useState(false);

  const normalizedQuotes = useMemo(
    () =>
      quotes.map((quote) =>
        normalizeQuote(quote, marketReference, brief.absoluteMaximum, brief.contentHash),
      ),
    [brief.absoluteMaximum, brief.contentHash, marketReference, quotes],
  );
  const finalists = finalistIds
    .map((id) => normalizedQuotes.find((quote) => quote.id === id))
    .filter((quote): quote is NonNullable<typeof quote> => Boolean(quote));

  // Per-finalist plan: cheapest OTHER selected finalist as leverage.
  const negotiationPlans = useMemo(() => {
    const map: Record<string, NegotiationPlan | undefined> = {};
    for (const f of finalists) {
      const peers = finalists.filter((other) => other.id !== f.id);
      map[f.id] = buildNegotiationPlan(f, peers.length ? peers : normalizedQuotes, brief);
    }
    return map;
  }, [finalists, normalizedQuotes, brief]);

  const eligibleQuotes = normalizedQuotes.filter((quote) => quote.eligibleForRanking);
  const allCallsStructured = quotes.length >= 3 && quotes.every((quote) => Boolean(quote.outcome));
  const negotiationComplete =
    finalistIds.length > 0 &&
    finalistIds.every((id) => quotes.find((q) => q.id === id)?.status === "negotiated");
  const stepIndex = steps.findIndex((item) => item.id === step);
  const activeStep = steps[stepIndex];

  const stepComplete: Record<CampaignStep, boolean> = {
    intake: brief.status === "confirmed" && Boolean(brief.contentHash),
    research: marketReference.status === "complete",
    calls: allCallsStructured,
    compare: finalistIds.length >= 2,
    negotiate: negotiationComplete,
    recommend: negotiationComplete && allCallsStructured,
  };

  const stepUnlocked: Record<CampaignStep, boolean> = {
    intake: true,
    research: stepComplete.intake,
    calls: stepComplete.intake && stepComplete.research,
    compare: stepComplete.calls,
    negotiate: stepComplete.calls && eligibleQuotes.length >= 2 && finalistIds.length >= 2,
    recommend: stepComplete.negotiate && stepComplete.calls,
  };

  function updateQuote(updated: VendorQuote) {
    setQuotes((current) => current.map((quote) => (quote.id === updated.id ? updated : quote)));
  }

  function updateBrief(updated: CateringBrief) {
    const invalidatesCampaign = brief.status === "confirmed" && updated.status === "draft";
    setBrief(updated);
    if (invalidatesCampaign) {
      setMarketReference(emptyMarketReference);
      setQuotes(initialQuotes);
      setFinalistIds([]);
      setActiveQuoteId(undefined);
      setDemoMode(false);
    }
  }

  async function confirmBrief() {
    setBrief(await confirmCanonicalBrief(brief));
  }

  async function loadDemoScenario() {
    const demoBrief = await createDemoBrief();
    setBrief(demoBrief);
    setMarketReference(demoMarketReference);
    setQuotes(createDemoQuotes(demoBrief));
    setFinalistId(undefined);
    setNegotiationPlan(undefined);
    setActiveQuoteId(undefined);
    setDemoMode(true);
    setStep("intake");
  }

  async function runResearch() {
    setResearchError(undefined);
    setResearchProgress({
      stage: "brief",
      message: "Confirming the research scope",
      detail: "Checking the event brief before searching live sources.",
    });
    setMarketReference((current) => ({ ...current, status: "researching" }));
    try {
      const result = await researchMarket(brief, setResearchProgress);
      setMarketReference(result);
      if (result.vendors?.length) {
        setQuotes((current) =>
          current.map((quote, index) => {
            const vendor = result.vendors[index];
            return vendor ? { ...quote, vendorName: vendor.name } : quote;
          }),
        );
      }
    } catch (error) {
      setMarketReference(emptyMarketReference);
      setResearchError(error instanceof Error ? error.message : "Market research failed");
    } finally {
      setResearchProgress(undefined);
    }
  }

  const nextStep = () => {
    const next = steps[stepIndex + 1];
    if (next && stepUnlocked[next.id]) setStep(next.id);
  };

  const upcomingStep = steps[stepIndex + 1];
  const upcomingStepUnlocked = upcomingStep ? stepUnlocked[upcomingStep.id] : false;
  const completedStepCount = Object.values(stepComplete).filter(Boolean).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">L</span>
          <span>
            <strong>Lilly</strong>
            <small>Your AI event sourcing assistant</small>
          </span>
        </a>
        <div className="campaign-chip">
          <span className="live-dot" /> Event sourcing workspace · Plan v{brief.version}
        </div>
        <div className="topbar__status">
          <Check size={15} /> Verified sources on
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-heading">
          <span className="sidebar-label">Your sourcing plan</span>
          <span>
            {completedStepCount} of {steps.length} complete
          </span>
        </div>
        <nav>
          {steps.map((item, index) => {
            const Icon = item.icon;
            const complete = stepComplete[item.id];
            const unlocked = stepUnlocked[item.id];
            return (
              <button
                className={item.id === step ? "nav-item nav-item--active" : "nav-item"}
                type="button"
                onClick={() => unlocked && setStep(item.id)}
                disabled={!unlocked}
                key={item.id}
              >
                <span className="nav-icon">
                  {complete ? <Check size={17} /> : <Icon size={17} />}
                </span>
                <span>
                  <small>0{index + 1}</small>
                  <strong>{item.label}</strong>
                  <em>{stepDescriptions[item.id]}</em>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <strong>{demoMode ? "Sample event active" : "Lilly workspace"}</strong>
          <span>
            {demoMode ? "Explore the full experience safely" : "AI event sourcing assistant"}
          </span>
        </div>
      </aside>

      <main className="main-workspace">
        <div className="workspace-context" aria-label="Current workflow progress">
          <div>
            <span className="workspace-context__step">
              Step {stepIndex + 1} of {steps.length}
            </span>
            <strong>{activeStep.label}</strong>
            <span>{stepDescriptions[step]}</span>
          </div>
          <progress
            className="workspace-progress"
            value={stepIndex + 1}
            max={steps.length}
            aria-label={`Step ${stepIndex + 1} of ${steps.length}`}
          />
        </div>
        {step === "intake" && (
          <BriefForm
            brief={brief}
            onChange={updateBrief}
            onConfirm={confirmBrief}
            onLoadDemo={loadDemoScenario}
          />
        )}
        {step === "research" && (
          <MarketResearch
            brief={brief}
            reference={marketReference}
            onResearch={runResearch}
            error={researchError}
            progress={researchProgress}
          />
        )}
        {step === "calls" && (
          <VendorCalls
            brief={brief}
            quotes={quotes}
            vendors={marketReference.vendors}
            activeQuoteId={activeQuoteId}
            onActivate={setActiveQuoteId}
            onUpdate={updateQuote}
          />
        )}
        {step === "compare" && (
          <Comparison
            brief={brief}
            reference={marketReference}
            quotes={normalizedQuotes}
            onSelectFinalist={(id) => {
              const selectedFinalist = normalizedQuotes.find((quote) => quote.id === id);
              setFinalistId(id);
              setNegotiationPlan(buildNegotiationPlan(selectedFinalist, normalizedQuotes, brief));
              setStep("negotiate");
            }}
          />
        )}
        {step === "negotiate" && (
          <Negotiation
            brief={brief}
            finalist={finalist}
            plan={negotiationPlan}
            onUpdate={updateQuote}
          />
        )}
        {step === "recommend" && <Recommendation brief={brief} quotes={normalizedQuotes} />}
      </main>

      {upcomingStep && (
        <div className="workflow-footer">
          <span>
            {upcomingStepUnlocked
              ? `${activeStep.label} is ready. Continue when you are.`
              : `Complete this step to unlock ${upcomingStep.label.toLowerCase()}.`}
          </span>
          <button
            className="next-step"
            type="button"
            onClick={nextStep}
            disabled={!upcomingStepUnlocked}
          >
            Continue to {upcomingStep.label}
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
