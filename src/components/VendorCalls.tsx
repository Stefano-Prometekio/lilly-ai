import { CheckCircle2, ClipboardPen, Headphones, PhoneOutgoing, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CateringBrief, MarketVendor, VendorQuote } from "../domain";
import { VoiceSession } from "./VoiceSession";
import { BrowserPhoneCall, type BrowserCallRequest } from "./BrowserPhoneCall";


async function placeElevenLabsCall(brief: CateringBrief, quote: VendorQuote, toNumber: string) {
  const res = await fetch("/api/outbound-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toNumber,
      dynamicVariables: {
        campaign_id: brief.id,
        brief_id: brief.id,
        brief_version: brief.version,
        call_session_id: quote.id,
        call_mode: "INITIAL_QUOTE",
        vendor_name: quote.vendorName,
        event_summary: `${brief.eventType}, ${brief.eventDate}, ${brief.city}, ${brief.guestCount} guests, ${brief.serviceStyle}`,
        hard_constraints_summary: brief.dietaryRequirements,
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof json?.detail === "string" ? json.detail : JSON.stringify(json?.detail ?? json),
    );
  }
  const conversationId: string | undefined =
    json?.result?.conversation_id || json?.result?.conversationId;
  return { conversationId, raw: json };
}

type CallEndReason = "completed" | "unanswered" | "timeout";

async function waitForCallToEnd(
  conversationId: string,
  signal: AbortSignal,
): Promise<CallEndReason> {
  const start = Date.now();
  const maxMs = 12 * 60 * 1000;
  // If the call stays "initiated" with 0 duration for this long, treat as unanswered.
  const unansweredMs = 75 * 1000;
  while (!signal.aborted && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 4000));
    if (signal.aborted) return "timeout";
    try {
      const res = await fetch(
        `/api/call-status?conversation_id=${encodeURIComponent(conversationId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const status: string | undefined = data?.status;
        const duration: number = data?.metadata?.call_duration_secs ?? 0;
        if (
          status &&
          status !== "in-progress" &&
          status !== "processing" &&
          status !== "initiated"
        ) {
          return duration > 0 ? "completed" : "unanswered";
        }
        // Stuck in "initiated" with no audio → vendor never picked up.
        if (status === "initiated" && duration === 0 && Date.now() - start > unansweredMs) {
          return "unanswered";
        }
      }
    } catch {
      // keep polling
    }
  }
  return "timeout";
}

function PhoneCallLauncher({
  brief,
  quote,
}: {
  brief: CateringBrief;
  quote: VendorQuote;
}) {
  const [phone, setPhone] = useState(DEMO_PHONE_NUMBER);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "calling" } | { kind: "ok"; msg: string } | { kind: "error"; msg: string }
  >({ kind: "idle" });

  async function placeCall() {
    setStatus({ kind: "calling" });
    try {
      await placeElevenLabsCall(brief, quote, phone);
      setStatus({ kind: "ok", msg: "Call placed. Lilly is dialing." });
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
    }
  }

  return (
    <div className="voice-session" style={{ flexWrap: "wrap" }}>
      <div className="voice-orb" aria-hidden="true">
        <PhoneCall size={26} />
      </div>
      <div className="voice-session__copy">
        <strong>Real phone call via ElevenLabs + Twilio</strong>
        <span>
          {status.kind === "idle" && "Lilly will dial the number below."}
          {status.kind === "calling" && "Placing call..."}
          {status.kind === "ok" && status.msg}
          {status.kind === "error" && `Error: ${status.msg}`}
        </span>
      </div>
      <div className="voice-session__actions" style={{ gap: 8 }}>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="Phone number to call"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", minWidth: 180 }}
        />
        <button
          className="button button--primary"
          type="button"
          disabled={status.kind === "calling"}
          onClick={placeCall}
        >
          <PhoneCall size={17} /> Call vendor
        </button>
      </div>
    </div>
  );
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
  const abortRef = useRef<AbortController | null>(null);
  const [seq, setSeq] = useState<SequentialState>({
    running: false,
    currentIndex: -1,
    log: [],
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  async function runAllCalls() {
    const controller = new AbortController();
    abortRef.current = controller;
    setSeq({ running: true, currentIndex: 0, log: [], error: undefined });

    for (let i = 0; i < quotes.length; i++) {
      if (controller.signal.aborted) break;
      const quote = quotes[i];
      setSeq((s) => ({
        ...s,
        currentIndex: i,
        log: [...s.log, `Calling ${quote.vendorName}...`],
      }));
      onUpdate({ ...quote, status: "calling" });
      try {
        const { conversationId } = await placeElevenLabsCall(brief, quote, DEMO_PHONE_NUMBER);
        if (conversationId) {
          setSeq((s) => ({
            ...s,
            log: [...s.log, `Connected with ${quote.vendorName} (${conversationId}). Waiting for call to end...`],
          }));
          const reason = await waitForCallToEnd(conversationId, controller.signal);
          if (reason === "unanswered") {
            setSeq((s) => ({
              ...s,
              log: [...s.log, `${quote.vendorName} did not answer. Moving on.`],
            }));
            onUpdate({ ...quote, status: "not-started" });
          } else {
            setSeq((s) => ({ ...s, log: [...s.log, `Finished call with ${quote.vendorName}.`] }));
          }
        } else {
          setSeq((s) => ({
            ...s,
            log: [...s.log, `Call to ${quote.vendorName} placed (no conversation id). Waiting 60s.`],
          }));
          await new Promise((r) => setTimeout(r, 60000));
          setSeq((s) => ({ ...s, log: [...s.log, `Finished call with ${quote.vendorName}.`] }));
        }
      } catch (e) {
        setSeq((s) => ({
          ...s,
          error: (e as Error).message,
          log: [...s.log, `Error calling ${quote.vendorName}: ${(e as Error).message}`],
          running: false,
        }));
        return;
      }
    }
    setSeq((s) => ({ ...s, running: false, currentIndex: -1, log: [...s.log, "All calls complete."] }));
  }

  function stopAllCalls() {
    abortRef.current?.abort();
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
          Lilly will call each vendor back-to-back at the demo number{" "}
          <strong>{DEMO_PHONE_NUMBER}</strong>, introduce herself, and gather a full quote before
          moving on.
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
          <PhoneCallLauncher brief={brief} quote={activeQuote} />

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
