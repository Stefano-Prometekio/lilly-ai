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
  const ranked = [...quotes].sort((a, b) => b.score - a.score);

  return (
    <section className="panel comparison-panel">
      <div className="section-heading">
        <div>
          <span className="kicker">Scope-equivalent comparison</span>
          <h2>What the same event actually costs</h2>
        </div>
        <div className="benchmark-chip">
          <CircleDollarSign size={16} />
          <span>Market reference</span>
          <strong>{formatMoney(reference.medianTotal, brief.currency)}</strong>
        </div>
      </div>
      <p className="panel-intro">
        Headline totals are never ranked directly. Lilly adds every disclosed fee, then compares the
        same required scope.
      </p>

      <div className="comparison-table" role="table" aria-label="Normalized vendor comparison">
        <div className="comparison-row comparison-row--head" role="row">
          <span>Vendor</span>
          <span>Headline</span>
          <span>Normalized</span>
          <span>vs market</span>
          <span>Evidence</span>
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
                <span>{quote.status === "captured" ? "Quote captured" : "Demo fixture"}</span>
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
              className="icon-button"
              type="button"
              aria-label={`Select ${quote.vendorName} for negotiation`}
              onClick={() => onSelectFinalist(quote.id)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        ))}
      </div>

      <div className="comparison-footnotes">
        <span>
          <BadgeCheck size={16} /> Required scope: food, staffing, delivery, tableware, and tax.
        </span>
        <span>
          <AlertTriangle size={16} /> Any offer 30% below the market reference is flagged until
          verified.
        </span>
      </div>
    </section>
  );
}
