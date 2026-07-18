import { CheckCircle2, ClipboardPen, Headphones, UserRound } from "lucide-react";
import type { CateringBrief, VendorQuote } from "../domain";
import { VoiceSession } from "./VoiceSession";

const personaCopy = {
  "hidden-fees": {
    label: "Hidden-fee lowballer",
    objective:
      "Start low. Reveal staffing, delivery, tableware, or tax only when Lilly asks precisely.",
  },
  upseller: {
    label: "Hard-sell upseller",
    objective:
      "Push a premium package and ask for the maximum budget before completing the base quote.",
  },
  stonewaller: {
    label: "Tough stonewaller",
    objective:
      "Give vague ranges and limited authority. Move only when Lilly asks focused questions.",
  },
};

interface VendorCallsProps {
  brief: CateringBrief;
  quotes: VendorQuote[];
  activeQuoteId?: string;
  onActivate: (id?: string) => void;
  onUpdate: (quote: VendorQuote) => void;
}

export function VendorCalls({
  brief,
  quotes,
  activeQuoteId,
  onActivate,
  onUpdate,
}: VendorCallsProps) {
  const activeQuote = quotes.find((quote) => quote.id === activeQuoteId);

  return (
    <section className="calls-layout">
      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Round one</span>
            <h2>Three live vendor conversations</h2>
          </div>
          <span className="status-pill">
            {quotes.filter((q) => q.status === "captured").length}/3 captured
          </span>
        </div>
        <p className="panel-intro">
          Choose a private behavior card, start a browser voice session, and role-play that vendor.
          Lilly is never told the persona.
        </p>
        <div className="vendor-grid">
          {quotes.map((quote, index) => {
            const copy = personaCopy[quote.persona];
            return (
              <article
                className={`vendor-card ${activeQuoteId === quote.id ? "vendor-card--active" : ""}`}
                key={quote.id}
              >
                <div className="vendor-card__top">
                  <span className="vendor-index">0{index + 1}</span>
                  {quote.status === "captured" && (
                    <CheckCircle2 size={19} className="success-icon" />
                  )}
                </div>
                <input
                  className="vendor-name-input"
                  value={quote.vendorName}
                  onChange={(event) => onUpdate({ ...quote, vendorName: event.target.value })}
                  aria-label={`Vendor ${index + 1} name`}
                />
                <span className="persona-label">
                  <UserRound size={14} /> Private card: {copy.label}
                </span>
                <p>{copy.objective}</p>
                <button
                  className="button button--secondary button--wide"
                  type="button"
                  onClick={() => onActivate(quote.id)}
                >
                  <Headphones size={17} /> Open call room
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {activeQuote && (
        <div className="panel call-room">
          <div className="section-heading">
            <div>
              <span className="kicker">Live role-play room</span>
              <h2>{activeQuote.vendorName}</h2>
            </div>
            <button className="text-button" type="button" onClick={() => onActivate(undefined)}>
              Close
            </button>
          </div>
          <div className="persona-brief">
            <ClipboardPen size={18} />
            <div>
              <strong>Your private role-play instruction</strong>
              <span>{personaCopy[activeQuote.persona].objective}</span>
            </div>
          </div>
          <VoiceSession
            agentId={import.meta.env.VITE_ELEVENLABS_PROCUREMENT_AGENT_ID}
            label={`Lilly calling ${activeQuote.vendorName}`}
            dynamicVariables={{
              campaign_id: brief.id,
              brief_id: brief.id,
              brief_version: brief.version,
              call_session_id: activeQuote.id,
              call_mode: "INITIAL_QUOTE",
              vendor_name: activeQuote.vendorName,
              event_summary: `${brief.eventType}, ${brief.eventDate}, ${brief.city}, ${brief.guestCount} guests, ${brief.serviceStyle}`,
              hard_constraints_summary: brief.dietaryRequirements,
              may_use_verified_leverage: false,
            }}
            onStarted={() => onUpdate({ ...activeQuote, status: "calling" })}
          />

          <div className="quote-capture">
            <span className="kicker">Structured call outcome</span>
            <div className="field-grid field-grid--compact">
              <label>
                <span>Headline total</span>
                <input
                  type="number"
                  value={activeQuote.headlineTotal}
                  onChange={(e) =>
                    onUpdate({ ...activeQuote, headlineTotal: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>Food & beverage</span>
                <input
                  type="number"
                  value={activeQuote.components.foodAndBeverage}
                  onChange={(e) =>
                    onUpdate({
                      ...activeQuote,
                      components: {
                        ...activeQuote.components,
                        foodAndBeverage: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                <span>Staffing</span>
                <input
                  type="number"
                  value={activeQuote.components.staffing}
                  onChange={(e) =>
                    onUpdate({
                      ...activeQuote,
                      components: { ...activeQuote.components, staffing: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                <span>Delivery</span>
                <input
                  type="number"
                  value={activeQuote.components.delivery}
                  onChange={(e) =>
                    onUpdate({
                      ...activeQuote,
                      components: { ...activeQuote.components, delivery: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                <span>Tableware</span>
                <input
                  type="number"
                  value={activeQuote.components.tableware}
                  onChange={(e) =>
                    onUpdate({
                      ...activeQuote,
                      components: { ...activeQuote.components, tableware: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                <span>Tax / fees</span>
                <input
                  type="number"
                  value={activeQuote.components.tax + activeQuote.components.other}
                  onChange={(e) =>
                    onUpdate({
                      ...activeQuote,
                      components: {
                        ...activeQuote.components,
                        tax: Number(e.target.value),
                        other: 0,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              <span>Evidence notes</span>
              <textarea
                value={activeQuote.notes}
                onChange={(e) => onUpdate({ ...activeQuote, notes: e.target.value })}
              />
            </label>
            <button
              className="button button--primary button--wide"
              type="button"
              onClick={() => onUpdate({ ...activeQuote, status: "captured" })}
            >
              <CheckCircle2 size={18} /> Save structured outcome
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
