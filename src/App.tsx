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
import type { CampaignStep, CateringBrief, MarketReference, VendorQuote } from "./domain";
import { BriefForm } from "./components/BriefForm";
import { MarketResearch } from "./components/MarketResearch";
import { VendorCalls } from "./components/VendorCalls";
import { Comparison } from "./components/Comparison";
import { Negotiation } from "./components/Negotiation";
import { Recommendation } from "./components/Recommendation";
import {
  emptyMarketReference,
  initialBrief,
  initialQuotes,
  normalizeQuote,
} from "./lib/procurement";
import { researchMarket } from "./lib/market-research";

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
  const [researchError, setResearchError] = useState<string>();

  const normalizedQuotes = useMemo(
    () => quotes.map((quote) => normalizeQuote(quote, marketReference, brief.absoluteMaximum)),
    [brief.absoluteMaximum, marketReference, quotes],
  );
  const finalist = normalizedQuotes.find((quote) => quote.id === finalistId);
  const bestAlternative = normalizedQuotes
    .filter((quote) => quote.id !== finalistId)
    .sort((a, b) => b.score - a.score)[0];
  const stepIndex = steps.findIndex((item) => item.id === step);

  function updateQuote(updated: VendorQuote) {
    setQuotes((current) => current.map((quote) => (quote.id === updated.id ? updated : quote)));
  }

  async function runResearch() {
    setResearchError(undefined);
    setMarketReference((current) => ({ ...current, status: "researching" }));
    try {
      setMarketReference(await researchMarket(brief));
    } catch (error) {
      setMarketReference(emptyMarketReference);
      setResearchError(error instanceof Error ? error.message : "Market research failed");
    }
  }

  const nextStep = () => {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1].id);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setStep("intake")}>
          <span className="brand-mark">L</span>
          <span>
            <strong>Lilly</strong>
            <small>Your procurement partner</small>
          </span>
        </button>
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
            const complete = index < stepIndex;
            return (
              <button
                className={item.id === step ? "nav-item nav-item--active" : "nav-item"}
                type="button"
                onClick={() => setStep(item.id)}
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
          <span>Browser voice mode</span>
        </div>
      </aside>

      <main className="main-workspace">
        {step === "intake" && (
          <BriefForm
            brief={brief}
            onChange={setBrief}
            onConfirm={() => setBrief({ ...brief, status: "confirmed" })}
          />
        )}
        {step === "research" && (
          <MarketResearch
            brief={brief}
            reference={marketReference}
            onResearch={runResearch}
            error={researchError}
          />
        )}
        {step === "calls" && (
          <VendorCalls
            brief={brief}
            quotes={quotes}
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
              setFinalistId(id);
              setStep("negotiate");
            }}
          />
        )}
        {step === "negotiate" && (
          <Negotiation
            brief={brief}
            finalist={finalist}
            bestAlternative={bestAlternative}
            onUpdate={updateQuote}
          />
        )}
        {step === "recommend" && <Recommendation brief={brief} quotes={normalizedQuotes} />}
      </main>

      {stepIndex < steps.length - 1 && (
        <button className="next-step" type="button" onClick={nextStep}>
          Continue to {steps[stepIndex + 1].label}
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

export default App;
