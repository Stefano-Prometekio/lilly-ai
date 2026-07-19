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
          <span className="kicker">Scope-equivalent comparison</span>
          <h2>Only evidence-eligible quotes can rank</h2>
        </div>
        <div className="benchmark-chip">
          <CircleDollarSign size={16} />
          <span>Market reference</span>
          <strong>
            {hasReference ? formatMoney(reference.medianTotal, brief.currency) : "Unavailable"}
          </strong>
        </div>
      </div>
      <p className="panel-intro">
        Eligibility requires an itemized outcome, every required line item, transcript evidence, and
        the same frozen brief fingerprint. Unknown costs are never treated as free.
      </p>

      {ranked.length > 0 ? (
        <div className="comparison-table" role="table" aria-label="Eligible vendor comparison">
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
      ) : (
        <div className="empty-state">
          <AlertTriangle size={38} />
          <strong>No quote is eligible to rank</strong>
          <span>Complete the baseline, structured outcomes, and transcript evidence first.</span>
        </div>
      )}

      {nonRanked.length > 0 && (
        <div className="ineligible-list">
          <span className="kicker">Not ranked</span>
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
          <BadgeCheck size={16} /> Required scope: food, staffing, delivery, tableware, tax, and
          other disclosed fees.
        </span>
        <span>
          <AlertTriangle size={16} /> Offers 30% below the market reference remain flagged.
        </span>
      </div>
    </section>
  );
}
