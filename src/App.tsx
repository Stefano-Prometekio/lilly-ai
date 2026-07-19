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
  { id: "intake", label: "Intake", icon: Mic2 },
  { id: "research", label: "Market research", icon: FileSearch },
  { id: "calls", label: "Vendor calls", icon: ListChecks },
  { id: "compare", label: "Compare", icon: BarChart3 },
  { id: "negotiate", label: "Negotiate", icon: Handshake },
  { id: "recommend", label: "Recommendation", icon: Sparkles },
];

function App() {
  const [step, setStep] = useState<CampaignStep>("intake");
  const [brief, setBrief] = useState<CateringBrief>(initialBrief);
  const [marketReference, setMarketReference] = useState<MarketReference>(emptyMarketReference);
  const [quotes, setQuotes] = useState<VendorQuote[]>(initialQuotes);
  const [activeQuoteId, setActiveQuoteId] = useState<string>();
  const [finalistId, setFinalistId] = useState<string>();
  const [negotiationPlan, setNegotiationPlan] = useState<NegotiationPlan>();
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
  const finalist = normalizedQuotes.find((quote) => quote.id === finalistId);
  const eligibleQuotes = normalizedQuotes.filter((quote) => quote.eligibleForRanking);
  const allCallsStructured = quotes.length >= 3 && quotes.every((quote) => Boolean(quote.outcome));
  const negotiationComplete = quotes.some(
    (quote) => quote.status === "negotiated" && Boolean(quote.negotiation?.changedTerms),
  );
  const stepIndex = steps.findIndex((item) => item.id === step);

  const stepComplete: Record<CampaignStep, boolean> = {
    intake: brief.status === "confirmed" && Boolean(brief.contentHash),
    research: marketReference.status === "complete",
    calls: allCallsStructured,
    compare: Boolean(finalistId),
    negotiate: negotiationComplete,
    recommend: negotiationComplete && allCallsStructured,
  };

  const stepUnlocked: Record<CampaignStep, boolean> = {
    intake: true,
    research: stepComplete.intake,
    calls: stepComplete.intake && stepComplete.research,
    compare: stepComplete.calls,
    negotiate: stepComplete.calls && eligibleQuotes.length >= 2 && Boolean(finalistId),
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
      setFinalistId(undefined);
      setNegotiationPlan(undefined);
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">L</span>
          <span>
            <strong>Lilly</strong>
            <small>Your event planning assistant</small>
          </span>
        </a>
        <div className="campaign-chip">
          <span className="live-dot" /> Catering campaign · Brief v{brief.version}
        </div>
        <div className="topbar__status">
          <Check size={15} /> Evidence mode on
        </div>
      </header>

      <aside className="sidebar">
        <span className="sidebar-label">Campaign</span>
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
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <strong>Hackathon demo</strong>
          <span>{demoMode ? "Transparent scripted dry run" : "Browser voice mode"}</span>
        </div>
      </aside>

      <main className="main-workspace">
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

      {stepIndex < steps.length - 1 && (
        <button
          className="next-step"
          type="button"
          onClick={nextStep}
          disabled={!stepUnlocked[steps[stepIndex + 1].id]}
        >
          Continue to {steps[stepIndex + 1].label}
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

export default App;
