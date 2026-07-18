import { CheckCircle2, ClipboardPen, Headphones, PhoneOutgoing, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CateringBrief, MarketVendor, VendorQuote } from "../domain";
import { VoiceSession } from "./VoiceSession";
import { BrowserPhoneCall, type BrowserCallRequest } from "./BrowserPhoneCall";


function buildDynamicVariables(brief: CateringBrief, quote: VendorQuote) {
  return {
    campaign_id: brief.id,
    brief_id: brief.id,
    brief_version: brief.version,
    call_session_id: quote.id,
    call_mode: "INITIAL_QUOTE",
    vendor_name: quote.vendorName,
    event_summary: `${brief.eventType}, ${brief.eventDate}, ${brief.city}, ${brief.guestCount} guests, ${brief.serviceStyle}`,
    hard_constraints_summary: brief.dietaryRequirements,
  } as Record<string, string | number | boolean>;
}


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
  vendors?: MarketVendor[];
  activeQuoteId?: string;
  onActivate: (id?: string) => void;
  onUpdate: (quote: VendorQuote) => void;
}

interface SequentialState {
  running: boolean;
  currentIndex: number;
  log: string[];
  error?: string;
}

export function VendorCalls({
  brief,
  quotes,
  vendors,
  activeQuoteId,
  onActivate,
  onUpdate,
}: VendorCallsProps) {
  const activeQuote = quotes.find((quote) => quote.id === activeQuoteId);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const resolveCallRef = useRef<((reason: "ended" | "declined") => void) | null>(null);
  const [seq, setSeq] = useState<SequentialState>({
    running: false,
    currentIndex: -1,
    log: [],
  });
  const [currentCall, setCurrentCall] = useState<
    (BrowserCallRequest & { quoteId: string }) | null
  >(null);

  useEffect(
    () => () => {
      abortRef.current.aborted = true;
    },
    [],
  );

  function waitForBrowserCall(quote: VendorQuote): Promise<"ended" | "declined"> {
    return new Promise((resolve) => {
      resolveCallRef.current = resolve;
      setCurrentCall({
        quoteId: quote.id,
        vendorName: quote.vendorName,
        vendorAddress: vendors?.find((_v, i) => quotes[i]?.id === quote.id)?.address,
        dynamicVariables: buildDynamicVariables(brief, quote),
      });
    });
  }

  function finishCall(reason: "ended" | "declined") {
    setCurrentCall(null);
    const r = resolveCallRef.current;
    resolveCallRef.current = null;
    r?.(reason);
  }

  async function runAllCalls() {
    abortRef.current = { aborted: false };
    setSeq({ running: true, currentIndex: 0, log: [], error: undefined });

    for (let i = 0; i < quotes.length; i++) {
      if (abortRef.current.aborted) break;
      const quote = quotes[i];
      setSeq((s) => ({
        ...s,
        currentIndex: i,
        log: [...s.log, `Ringing ${quote.vendorName} in the browser...`],
      }));
      onUpdate({ ...quote, status: "calling" });
      const reason = await waitForBrowserCall(quote);
      if (abortRef.current.aborted) break;
      if (reason === "declined") {
        setSeq((s) => ({
          ...s,
          log: [...s.log, `${quote.vendorName} did not answer. Moving on.`],
        }));
        onUpdate({ ...quote, status: "not-started" });
      } else {
        setSeq((s) => ({ ...s, log: [...s.log, `Finished call with ${quote.vendorName}.`] }));
      }
      // small pacing gap before the next vendor rings
      await new Promise((r) => setTimeout(r, 800));
    }
    setSeq((s) => ({ ...s, running: false, currentIndex: -1, log: [...s.log, "All calls complete."] }));
  }

  function stopAllCalls() {
    abortRef.current.aborted = true;
    if (resolveCallRef.current) finishCall("declined");
    setSeq((s) => ({ ...s, running: false }));
  }


  return (
    <section className="calls-layout">
      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Round one</span>
            <h2>Vendors from live market research</h2>
          </div>
          <span className="status-pill">
            {quotes.filter((q) => q.status === "captured").length}/{quotes.length} captured
          </span>
        </div>
        <p className="panel-intro">
          Lilly will call each vendor back-to-back <strong>right here in the browser</strong>. When
          the phone rings, click <strong>Answer</strong> to pick up as the vendor and talk to
          Lilly. She'll gather a full quote before moving on to the next.
        </p>


        <div className="voice-session" style={{ flexWrap: "wrap" }}>
          <div className="voice-orb" aria-hidden="true">
            <PhoneOutgoing size={26} />
          </div>
          <div className="voice-session__copy">
            <strong>Sequential outbound calls</strong>
            <span>
              {seq.running
                ? `Calling vendor ${seq.currentIndex + 1} of ${quotes.length}: ${quotes[seq.currentIndex]?.vendorName ?? ""}`
                : seq.log.length
                  ? seq.log[seq.log.length - 1]
                  : `Ready to call ${quotes.length} vendors in a row.`}
            </span>
          </div>
          <div className="voice-session__actions" style={{ gap: 8 }}>
            {seq.running ? (
              <button className="button button--secondary" type="button" onClick={stopAllCalls}>
                Stop
              </button>
            ) : (
              <button className="button button--primary" type="button" onClick={runAllCalls}>
                <PhoneOutgoing size={17} /> Proceed with vendor calls
              </button>
            )}
          </div>
        </div>

        {seq.log.length > 0 && (
          <ol
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(0,0,0,0.03)",
              borderRadius: 8,
              fontSize: 13,
              maxHeight: 160,
              overflowY: "auto",
            }}
          >
            {seq.log.map((line, i) => (
              <li key={i} style={{ listStyle: "decimal inside" }}>
                {line}
              </li>
            ))}
          </ol>
        )}

        <div className="vendor-grid" style={{ marginTop: 16 }}>
          {quotes.map((quote, index) => {
            const copy = personaCopy[quote.persona];
            const vendor = vendors?.[index];
            const isCurrent = seq.running && seq.currentIndex === index;
            return (
              <article
                className={`vendor-card ${activeQuoteId === quote.id ? "vendor-card--active" : ""}`}
                key={quote.id}
                style={isCurrent ? { outline: "2px solid #4f46e5" } : undefined}
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
                {vendor?.address && (
                  <span style={{ fontSize: 12, color: "#666" }}>{vendor.address}</span>
                )}
                {vendor?.rating != null && (
                  <span style={{ fontSize: 12, color: "#666" }}>
                    ★ {vendor.rating} ({vendor.reviewCount ?? 0} reviews)
                  </span>
                )}
                {quote.status === "captured" ? (
                  <>
                    <span className="persona-label">
                      <UserRound size={14} /> Negotiation style: {copy.label}
                    </span>
                    <p>{copy.objective}</p>
                  </>
                ) : (
                  <span className="persona-label" style={{ opacity: 0.6 }}>
                    <UserRound size={14} /> Negotiation style assigned after the call
                  </span>
                )}
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
      <BrowserPhoneCall
        call={currentCall}
        onDeclined={() => finishCall("declined")}
        onEnded={() => finishCall("ended")}
      />
    </section>

  );
}
