import { BadgeCheck, CircleDollarSign, Headphones, Sparkles, Trophy } from "lucide-react";
import type { CateringBrief, NormalizedQuote } from "../domain";
import { formatMoney } from "../lib/procurement";

interface RecommendationProps {
  brief: CateringBrief;
  quotes: NormalizedQuote[];
}

export function Recommendation({ brief, quotes }: RecommendationProps) {
  const recommended = [...quotes].sort((a, b) => b.score - a.score)[0];
  const lowest = [...quotes].sort((a, b) => a.normalizedTotal - b.normalizedTotal)[0];

  if (!recommended) return null;

  return (
    <section className="recommendation-layout">
      <div className="panel recommendation-hero">
        <div className="eyebrow">
          <Sparkles size={15} /> Lilly's recommendation
        </div>
        <div className="recommendation-badge">
          <Trophy size={24} />
        </div>
        <h1>{recommended.vendorName}</h1>
        <p className="lede">The strongest validated overall value for the confirmed event brief.</p>
        <strong className="recommendation-price">
          {formatMoney(recommended.normalizedTotal, brief.currency)}
        </strong>
        <span className="score-label">Overall value score {recommended.score}/100</span>
        <p className="recommendation-reason">
          This offer combines a competitive scope-equivalent total with{" "}
          {Math.round(recommended.evidenceConfidence * 100)}% evidence confidence and{" "}
          {Math.round(recommended.completeness * 100)}% quote completeness.
        </p>
      </div>

      <div className="recommendation-cards">
        <article className="panel mini-result">
          <div className="result-icon">
            <CircleDollarSign size={22} />
          </div>
          <div>
            <span>Lowest confirmed normalized cost</span>
            <strong>{lowest.vendorName}</strong>
            <p>{formatMoney(lowest.normalizedTotal, brief.currency)}</p>
          </div>
        </article>
        <article className="panel mini-result">
          <div className="result-icon">
            <BadgeCheck size={22} />
          </div>
          <div>
            <span>Evidence trail</span>
            <strong>Auditable by design</strong>
            <p>Every price, inclusion, and change links to its call evidence.</p>
          </div>
        </article>
        <article className="panel mini-result">
          <div className="result-icon">
            <Headphones size={22} />
          </div>
          <div>
            <span>Call record</span>
            <strong>Initial + negotiation</strong>
            <p>Recording and timestamped transcript slots are ready for webhook data.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
