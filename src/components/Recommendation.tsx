import {
  BadgeCheck,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Headphones,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { CateringBrief, EvidenceCitation, NormalizedQuote } from "../domain";
import { formatMoney } from "../lib/procurement";

interface RecommendationProps {
  brief: CateringBrief;
  quotes: NormalizedQuote[];
}

function formatEvidenceTime(seconds?: number) {
  if (seconds == null) return "Timestamp unavailable";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderEvidenceLink(evidence: EvidenceCitation) {
  const content = (
    <>
      {evidence.kind === "recording" ? <Headphones size={15} /> : <FileText size={15} />}
      <span>
        <strong>{evidence.label}</strong>
        <small>
          {evidence.kind === "transcript"
            ? `${formatEvidenceTime(evidence.timestampSeconds)} · ${evidence.excerpt ?? "Open transcript"}`
            : "Open recording"}
        </small>
      </span>
      {evidence.url && <ExternalLink size={14} />}
    </>
  );

  return evidence.url ? (
    <a
      className="evidence-link"
      href={evidence.url}
      target="_blank"
      rel="noreferrer"
      key={evidence.id}
    >
      {content}
    </a>
  ) : (
    <div className="evidence-link evidence-link--inline" key={evidence.id}>
      {content}
    </div>
  );
}

export function Recommendation({ brief, quotes }: RecommendationProps) {
  const ranked = quotes
    .filter((quote) => quote.eligibleForRanking)
    .sort((left, right) => right.score - left.score);
  const recommended = ranked[0];
  const lowest = [...ranked].sort((left, right) => left.normalizedTotal - right.normalizedTotal)[0];
  const nonQuoteOutcomes = quotes.filter((quote) => quote.outcome?.kind !== "itemized_quote");

  if (!recommended) {
    return (
      <section className="panel empty-state">
        <Sparkles size={40} />
        <strong>Your recommendation is not ready yet</strong>
        <span>
          Complete at least one comparable itemized offer to see Lilly&apos;s recommendation.
        </span>
      </section>
    );
  }

  const negotiation = recommended.negotiation;
  const recommendedRecording = recommended.evidence.some((item) => item.kind === "recording");

  return (
    <section className="recommendation-layout recommendation-layout--report">
      <div className="panel recommendation-hero">
        <div className="eyebrow">
          <Sparkles size={15} /> Lilly&apos;s recommendation
        </div>
        <div className="recommendation-badge">
          <Trophy size={24} />
        </div>
        <h1>{recommended.vendorName}</h1>
        <p className="lede">The strongest overall value for your confirmed event plan.</p>
        <strong className="recommendation-price">
          {formatMoney(recommended.normalizedTotal, brief.currency)}
        </strong>
        <span className="score-label">Overall value score · {recommended.score}/100</span>
        <p className="recommendation-reason">
          This offer combines {Math.round(recommended.completeness * 100)}% completeness,{" "}
          {Math.round(recommended.evidenceConfidence * 100)}% confidence, and terms that are
          stronger than the other comparable options.
          {lowest.id !== recommended.id && (
            <>
              {" "}
              It is{" "}
              {formatMoney(
                recommended.normalizedTotal - lowest.normalizedTotal,
                brief.currency,
              )}{" "}
              more than the lowest quote, so that trade-off is explicit.
            </>
          )}
        </p>
        {negotiation && (
          <div className="negotiation-result-card">
            <span>Offer improvement</span>
            <strong>
              {formatMoney(negotiation.initialTotal, brief.currency)} →{" "}
              {formatMoney(negotiation.finalTotal, brief.currency)}
            </strong>
            <p>{negotiation.changedTerms}</p>
            <small>Supported by a comparable vendor offer</small>
          </div>
        )}
      </div>

      <div className="recommendation-cards">
        <article className="panel mini-result">
          <div className="result-icon">
            <CircleDollarSign size={22} />
          </div>
          <div>
            <span>Lowest comparable cost</span>
            <strong>{lowest.vendorName}</strong>
            <p>{formatMoney(lowest.normalizedTotal, brief.currency)}</p>
          </div>
        </article>
        <article className="panel mini-result">
          <div className="result-icon">
            <BadgeCheck size={22} />
          </div>
          <div>
            <span>Fair comparison</span>
            <strong>Event plan v{brief.version}</strong>
            <p>The same confirmed brief was used for every comparable vendor offer.</p>
          </div>
        </article>
        <article className="panel mini-result">
          <div className="result-icon">
            <Headphones size={22} />
          </div>
          <div>
            <span>Conversation record</span>
            <strong>{recommendedRecording ? "Recording linked" : "Transcript available"}</strong>
            <p>
              {recommendedRecording
                ? "The vendor conversation is linked below."
                : "The supporting transcript excerpt is included below."}
            </p>
          </div>
        </article>
      </div>

      <div className="panel full-report">
        <div className="section-heading">
          <div>
            <span className="kicker">Complete comparison</span>
            <h2>All comparable vendor offers</h2>
          </div>
          <span className="status-pill status-pill--success">{ranked.length} ranked</span>
        </div>
        <div className="report-ranking" role="table" aria-label="Final ranked quote report">
          {ranked.map((quote, index) => (
            <article className="report-vendor" role="row" key={quote.id}>
              <div className="report-vendor__heading">
                <span className="rank-number">#{index + 1}</span>
                <div>
                  <strong>{quote.vendorName}</strong>
                  <small>
                    {formatMoney(quote.normalizedTotal, brief.currency)} · score {quote.score}/100
                  </small>
                </div>
                {quote.id === recommended.id && <span className="status-pill">Recommended</span>}
              </div>
              <dl className="itemized-breakdown">
                {Object.entries(quote.components).map(([label, amount]) => (
                  <div key={label}>
                    <dt>{label.replaceAll(/([A-Z])/g, " $1")}</dt>
                    <dd>{formatMoney(amount, brief.currency)}</dd>
                  </div>
                ))}
                <div>
                  <dt>Deposit</dt>
                  <dd>{quote.depositPercent}%</dd>
                </div>
                <div>
                  <dt>Cancellation notice</dt>
                  <dd>{quote.cancellationDays} days</dd>
                </div>
                <div>
                  <dt>Valid until</dt>
                  <dd>{quote.validUntil}</dd>
                </div>
              </dl>
              <details className="report-evidence">
                <summary>
                  View {quote.evidence.length} supporting{" "}
                  {quote.evidence.length === 1 ? "item" : "items"}
                </summary>
                <div className="evidence-list">
                  {quote.evidence.map(renderEvidenceLink)}
                  {!quote.evidence.some((evidence) => evidence.kind === "recording") && (
                    <span className="inline-note">
                      A recording was not supplied for this outcome.
                    </span>
                  )}
                </div>
              </details>
            </article>
          ))}
        </div>

        {nonQuoteOutcomes.length > 0 && (
          <div className="other-outcomes">
            <span className="kicker">Other vendor outcomes</span>
            {nonQuoteOutcomes.map((quote) => (
              <article key={quote.id}>
                <strong>{quote.vendorName}</strong>
                <span>{quote.outcome?.kind.replaceAll("_", " ")}</span>
                <p>{quote.outcome?.summary}</p>
                {quote.outcome?.callbackAt && <small>Callback: {quote.outcome.callbackAt}</small>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
