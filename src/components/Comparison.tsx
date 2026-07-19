import { AlertTriangle, ArrowRight, BadgeCheck, CircleDollarSign, Trophy } from "lucide-react";
import type { CateringBrief, MarketReference, NormalizedQuote } from "../domain";
import { formatMoney } from "../lib/procurement";

interface ComparisonProps {
  brief: CateringBrief;
  reference: MarketReference;
  quotes: NormalizedQuote[];
  onSelectFinalist: (id: string) => void;
}

export function Comparison({ brief, reference, quotes, onSelectFinalist }: ComparisonProps) {
  const ranked = quotes
    .filter((quote) => quote.eligibleForRanking)
    .sort((left, right) => right.score - left.score);
  const nonRanked = quotes.filter((quote) => !quote.eligibleForRanking);
  const hasReference = reference.status === "complete" && reference.medianTotal > 0;

  return (
    <section className="panel comparison-panel">
      <div className="section-heading">
        <div>
          <span className="kicker">Offer comparison</span>
          <h2>See value, price, and confidence side by side</h2>
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
        Lilly compares only complete, supported offers for the same event brief. Any missing or
        uncertain cost stays visible rather than being treated as free.
      </p>

      {ranked.length > 0 ? (
        <>
          <div className="comparison-table" role="table" aria-label="Eligible vendor comparison">
            <div className="comparison-row comparison-row--head" role="row">
              <span>Vendor</span>
              <span>Quoted</span>
              <span>Comparable total</span>
              <span>vs local range</span>
              <span>Confidence</span>
              <span>Score</span>
              <span></span>
            </div>
            {ranked.map((quote, index) => (
              <div className="comparison-row" role="row" key={quote.id}>
                <div className="vendor-cell">
                  {index === 0 ? (
                    <Trophy size={18} className="gold-icon" />
                  ) : (
                    <span className="rank-number">#{index + 1}</span>
                  )}
                  <div>
                    <strong>{quote.vendorName}</strong>
                    <span>{quote.outcome?.kind.replaceAll("_", " ")}</span>
                  </div>
                </div>
                <span>{formatMoney(quote.headlineTotal, brief.currency)}</span>
                <strong>{formatMoney(quote.normalizedTotal, brief.currency)}</strong>
                <span
                  className={
                    quote.suspiciousLow
                      ? "danger-text"
                      : quote.varianceFromMarket < 0
                        ? "success-text"
                        : ""
                  }
                >
                  {quote.varianceFromMarket > 0 ? "+" : ""}
                  {Math.round(quote.varianceFromMarket * 100)}%
                  {quote.suspiciousLow && <AlertTriangle size={15} />}
                </span>
                <span>{Math.round(quote.evidenceConfidence * 100)}%</span>
                <strong>{quote.score}</strong>
                <button
                  className="selection-action"
                  type="button"
                  aria-label={`Select ${quote.vendorName} for negotiation`}
                  onClick={() => onSelectFinalist(quote.id)}
                >
                  <span>Select</span>
                  <ArrowRight size={17} />
                </button>
              </div>
            ))}
          </div>

          <div className="comparison-cards" aria-label="Vendor comparison cards">
            {ranked.map((quote, index) => (
              <article
                className={
                  index === 0 ? "comparison-card comparison-card--leader" : "comparison-card"
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
                <button
                  className="button button--primary button--wide"
                  type="button"
                  onClick={() => onSelectFinalist(quote.id)}
                >
                  Improve this offer <ArrowRight size={17} />
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <AlertTriangle size={38} />
          <strong>No offer is ready to compare</strong>
          <span>Complete the market scan and capture each vendor outcome first.</span>
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
