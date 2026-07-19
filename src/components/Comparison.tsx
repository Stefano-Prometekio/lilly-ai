import { AlertTriangle, ArrowRight, BadgeCheck, CircleDollarSign, Trophy } from "lucide-react";
import type { CateringBrief, MarketReference, NormalizedQuote } from "../domain";
import { formatMoney } from "../lib/procurement";

interface ComparisonProps {
  brief: CateringBrief;
  reference: MarketReference;
  quotes: NormalizedQuote[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onProceed: (ids: string[]) => void;
}

export function Comparison({
  brief,
  reference,
  quotes,
  selectedIds,
  onToggleSelect,
  onProceed,
}: ComparisonProps) {
  const ranked = quotes
    .filter((quote) => quote.eligibleForRanking)
    .sort((left, right) => right.score - left.score);
  const nonRanked = quotes.filter((quote) => !quote.eligibleForRanking);
  const hasReference = reference.status === "complete" && reference.medianTotal > 0;
  const canProceed = selectedIds.length >= 2;

  return (
    <section className="panel comparison-panel">
      <div className="section-heading">
        <div>
          <span className="kicker">Offer comparison</span>
          <h2>Pick the vendors you want to push for a better offer</h2>
        </div>
        <div className="benchmark-chip">
          <CircleDollarSign size={16} />
          <span>Typical local price</span>
          <strong>
            {hasReference ? formatMoney(reference.medianTotal, brief.currency) : "Unavailable"}
          </strong>
        </div>
      </div>
      <p className="panel-intro">
        Select two or more vendors below. Lilly will call each one back with a counter-offer that
        uses the best selected alternative as leverage, then bring you the improved results.
      </p>

      {ranked.length > 0 ? (
        <div className="comparison-cards" aria-label="Vendor comparison cards">
          {ranked.map((quote, index) => {
            const isSelected = selectedIds.includes(quote.id);
            return (
              <article
                className={
                  (index === 0 ? "comparison-card comparison-card--leader" : "comparison-card") +
                  (isSelected ? " comparison-card--selected" : "")
                }
                key={quote.id}
              >
                <div className="comparison-card__header">
                  <span className="comparison-card__rank">
                    {index === 0 ? <Trophy size={17} /> : `#${index + 1}`}
                  </span>
                  <div>
                    <strong>{quote.vendorName}</strong>
                    <small>Value score {quote.score}/100</small>
                  </div>
                  {index === 0 && <span className="status-pill">Best value</span>}
                </div>
                <div className="comparison-card__price">
                  <span>Comparable total</span>
                  <strong>{formatMoney(quote.normalizedTotal, brief.currency)}</strong>
                  <small>{Math.round(quote.varianceFromMarket * 100)}% vs local range</small>
                </div>
                <div className="comparison-card__metrics">
                  <span>
                    <small>Complete</small>
                    <strong>{Math.round(quote.completeness * 100)}%</strong>
                  </span>
                  <span>
                    <small>Confidence</small>
                    <strong>{Math.round(quote.evidenceConfidence * 100)}%</strong>
                  </span>
                  <span>
                    <small>Quoted</small>
                    <strong>{formatMoney(quote.headlineTotal, brief.currency)}</strong>
                  </span>
                </div>
                <label className="comparison-card__select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(quote.id)}
                  />
                  <span>{isSelected ? "Selected for negotiation" : "Include in negotiation"}</span>
                </label>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <AlertTriangle size={38} />
          <strong>No offer is ready to compare</strong>
          <span>Complete the market scan and capture each vendor outcome first.</span>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="comparison-actions">
          <span>
            {selectedIds.length} selected {selectedIds.length === 1 ? "vendor" : "vendors"}
            {selectedIds.length < 2 && " · pick at least two to start the counter-offer round"}
          </span>
          <button
            className="button button--primary"
            type="button"
            disabled={!canProceed}
            onClick={() => onProceed(selectedIds)}
          >
            Improve selected offers <ArrowRight size={17} />
          </button>
        </div>
      )}

      {nonRanked.length > 0 && (
        <div className="ineligible-list">
          <span className="kicker">Not ready to compare</span>
          {nonRanked.map((quote) => (
            <article key={quote.id}>
              <strong>{quote.vendorName}</strong>
              <span>{quote.outcome?.kind.replaceAll("_", " ") ?? "No outcome"}</span>
              <small>{quote.ineligibilityReasons.join(" · ")}</small>
            </article>
          ))}
        </div>
      )}

      <div className="comparison-footnotes">
        <span>
          <BadgeCheck size={16} /> Every comparable total includes food, staffing, delivery,
          tableware, tax, and disclosed fees.
        </span>
        <span>
          <AlertTriangle size={16} /> Offers far below the local range remain clearly flagged.
        </span>
      </div>
    </section>
  );
}
