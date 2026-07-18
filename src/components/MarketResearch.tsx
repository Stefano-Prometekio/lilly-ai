import { ExternalLink, MapPin, Radar, Search, ShieldCheck } from "lucide-react";
import type { CateringBrief, MarketReference } from "../domain";
import { formatMoney } from "../lib/procurement";

interface MarketResearchProps {
  brief: CateringBrief;
  reference: MarketReference;
  onResearch: () => void;
  error?: string;
}

export function MarketResearch({ brief, reference, onResearch, error }: MarketResearchProps) {
  const running = reference.status === "researching";
  const hasReference = reference.status === "complete" || reference.status === "fallback";

  return (
    <section className="workspace-grid">
      <div className="panel panel--hero market-hero">
        <div className="eyebrow">
          <Radar size={15} /> Market intelligence
        </div>
        <h1>Establish the reference before calling.</h1>
        <p className="lede">
          Lilly searches for caterers and public pricing signals that match the confirmed event.
          This becomes the independent benchmark—not a vendor quote.
        </p>
        <div className="research-query">
          <Search size={20} />
          <div>
            <strong>
              {brief.serviceStyle} for {brief.guestCount} guests
            </strong>
            <span>
              <MapPin size={13} /> {brief.city} · within {brief.radiusKm} km
            </span>
          </div>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={onResearch}
          disabled={brief.status !== "confirmed" || running}
        >
          <Radar size={18} className={running ? "spin" : ""} />
          {running ? "Researching live sources..." : "Run market research"}
        </button>
        {brief.status !== "confirmed" && (
          <p className="inline-note">Confirm the brief before researching.</p>
        )}
        {error && <p className="error-note">{error}</p>}
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Independent benchmark</span>
            <h2>Expected market range</h2>
          </div>
          <span className={`status-pill ${hasReference ? "status-pill--success" : ""}`}>
            {reference.status === "fallback" ? "Demo fallback" : reference.status}
          </span>
        </div>

        {hasReference ? (
          <>
            <div className="range-chart">
              <div>
                <span>Low</span>
                <strong>{formatMoney(reference.lowTotal, brief.currency)}</strong>
              </div>
              <div className="range-chart__median">
                <span>Market reference</span>
                <strong>{formatMoney(reference.medianTotal, brief.currency)}</strong>
              </div>
              <div>
                <span>High</span>
                <strong>{formatMoney(reference.highTotal, brief.currency)}</strong>
              </div>
            </div>
            <div className="metric-row">
              <div>
                <span>Per guest</span>
                <strong>{formatMoney(reference.medianPerGuest, brief.currency)}</strong>
              </div>
              <div>
                <span>Sources</span>
                <strong>{reference.sampleSize || reference.sources.length}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{Math.round(reference.confidence * 100)}%</strong>
              </div>
            </div>
            <p className="summary-copy">{reference.summary}</p>
            {reference.status === "fallback" && (
              <div className="warning-card">
                <ShieldCheck size={18} />
                <span>
                  This value is visibly marked as illustrative and cannot be used as negotiation
                  leverage.
                </span>
              </div>
            )}
            <div className="source-list">
              {reference.sources.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                  <div>
                    <strong>{source.title}</strong>
                    <span>{source.note}</span>
                  </div>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Radar size={38} />
            <strong>No market reference yet</strong>
            <span>Confirm the brief, then launch the research agent.</span>
          </div>
        )}
      </div>
    </section>
  );
}
