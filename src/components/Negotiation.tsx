import { ArrowDownRight, CheckCircle2, Handshake, ShieldCheck, Target } from "lucide-react";
import type { CateringBrief, NormalizedQuote, VendorQuote } from "../domain";
import { formatMoney } from "../lib/procurement";
import { VoiceSession } from "./VoiceSession";

interface NegotiationProps {
  brief: CateringBrief;
  finalist?: NormalizedQuote;
  bestAlternative?: NormalizedQuote;
  onUpdate: (quote: VendorQuote) => void;
}

export function Negotiation({ brief, finalist, bestAlternative, onUpdate }: NegotiationProps) {
  if (!finalist || !bestAlternative) {
    return (
      <section className="panel empty-state">
        <Handshake size={40} />
        <strong>Select a finalist from the comparison</strong>
        <span>Lilly will build an evidence-gated negotiation plan.</span>
      </section>
    );
  }

  const gap = Math.max(0, finalist.normalizedTotal - bestAlternative.normalizedTotal);
  const improved = finalist.status === "negotiated";

  return (
    <section className="workspace-grid">
      <div className="panel">
        <div className="eyebrow">
          <Target size={15} /> Evidence-gated plan
        </div>
        <h1>Make one precise ask.</h1>
        <p className="lede">
          Lilly can discuss the verified pricing gap, but cannot reveal a competitor identity or
          invent a better bid.
        </p>

        <div className="negotiation-plan">
          <div>
            <span>Finalist</span>
            <strong>{finalist.vendorName}</strong>
          </div>
          <div>
            <span>Current normalized total</span>
            <strong>{formatMoney(finalist.normalizedTotal, brief.currency)}</strong>
          </div>
          <div>
            <span>Verified alternative</span>
            <strong>{formatMoney(bestAlternative.normalizedTotal, brief.currency)}</strong>
          </div>
          <div>
            <span>Competitive gap</span>
            <strong>{formatMoney(gap, brief.currency)}</strong>
          </div>
        </div>

        <div className="claim-card">
          <ShieldCheck size={19} />
          <div>
            <strong>Permitted claim</strong>
            <span>
              “A qualifying alternative has a lower expected total for the same required scope.”
            </span>
          </div>
        </div>
        <div className="target-ask">
          <ArrowDownRight size={22} />
          <div>
            <span>Targeted request</span>
            <strong>Waive delivery or include tableware at the current total.</strong>
          </div>
        </div>
      </div>

      <div className="panel call-room">
        <div className="section-heading">
          <div>
            <span className="kicker">Round two</span>
            <h2>Negotiation callback</h2>
          </div>
          {improved && <span className="status-pill status-pill--success">Improved</span>}
        </div>
        <VoiceSession
          agentId={import.meta.env.VITE_ELEVENLABS_PROCUREMENT_AGENT_ID}
          label={`Lilly negotiating with ${finalist.vendorName}`}
          dynamicVariables={{
            campaign_id: brief.id,
            brief_id: brief.id,
            brief_version: brief.version,
            call_session_id: `${finalist.id}-negotiation`,
            call_mode: "NEGOTIATION_CALLBACK",
            vendor_name: finalist.vendorName,
            current_total: finalist.normalizedTotal,
            verified_alternative_total: bestAlternative.normalizedTotal,
            competitive_gap: gap,
            permitted_claim:
              "A qualifying alternative has a lower expected total for the same required scope.",
            prohibited_disclosures: "competitor identity, absolute maximum budget",
          }}
        />

        <div className="quote-capture">
          <span className="kicker">Record the demonstrated change</span>
          <label>
            <span>What changed?</span>
            <input
              value={finalist.negotiatedChange ?? "Delivery fee waived"}
              onChange={(e) => onUpdate({ ...finalist, negotiatedChange: e.target.value })}
            />
          </label>
          <label>
            <span>New delivery fee</span>
            <input
              type="number"
              value={finalist.components.delivery}
              onChange={(e) =>
                onUpdate({
                  ...finalist,
                  components: { ...finalist.components, delivery: Number(e.target.value) },
                })
              }
            />
          </label>
          <button
            className="button button--primary button--wide"
            type="button"
            onClick={() =>
              onUpdate({
                ...finalist,
                status: "negotiated",
                initialNormalizedTotal: finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
              })
            }
          >
            <CheckCircle2 size={18} /> Confirm final offer version
          </button>
        </div>
      </div>
    </section>
  );
}
