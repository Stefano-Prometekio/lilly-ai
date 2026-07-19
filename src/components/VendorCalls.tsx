import { CheckCircle2, ClipboardPen, Headphones, PhoneOutgoing, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CallOutcomeKind,
  CateringBrief,
  MarketVendor,
  QuoteComponentKey,
  VendorQuote,
} from "../domain";
import { finalizeVendorQuote, quoteComponentKeys } from "../lib/procurement";
import { BrowserPhoneCall, type BrowserCallRequest } from "./BrowserPhoneCall";
import { VoiceSession } from "./VoiceSession";

function buildDynamicVariables(brief: CateringBrief, quote: VendorQuote) {
  return {
    campaign_id: brief.id,
    brief_id: brief.id,
    brief_version: brief.version,
    brief_hash: brief.contentHash ?? "",
    canonical_brief_json: brief.canonicalJson ?? "",
    call_session_id: quote.id,
    call_mode: "INITIAL_QUOTE",
    vendor_name: quote.vendorName,
    may_use_verified_leverage: false,
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
    objective: "Give vague ranges and limited authority. Move only after focused questions.",
  },
} as const;

const outcomeLabels: Record<CallOutcomeKind, string> = {
  itemized_quote: "Itemized quote",
  callback_commitment: "Callback commitment",
  documented_decline: "Documented decline",
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
  const resolveCallRef = useRef<
    ((result: { reason: "ended" | "declined"; conversationId: string | null }) => void) | null
  >(null);
  const [captureError, setCaptureError] = useState<string>();
  const [seq, setSeq] = useState<SequentialState>({
    running: false,
    currentIndex: -1,
    log: [],
  });
  const [currentCall, setCurrentCall] = useState<(BrowserCallRequest & { quoteId: string }) | null>(
    null,
  );
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(
    () => () => {
      abortRef.current.aborted = true;
    },
    [],
  );

  function waitForBrowserCall(
    quote: VendorQuote,
  ): Promise<{ reason: "ended" | "declined"; conversationId: string | null }> {
    return new Promise((resolve) => {
      resolveCallRef.current = resolve;
      setCurrentCall({
        quoteId: quote.id,
        vendorName: quote.vendorName,
        vendorAddress: vendors?.find((_vendor, index) => quotes[index]?.id === quote.id)?.address,
        dynamicVariables: buildDynamicVariables(brief, quote),
      });
    });
  }

  function finishCall(reason: "ended" | "declined", conversationId: string | null = null) {
    setCurrentCall(null);
    const resolve = resolveCallRef.current;
    resolveCallRef.current = null;
    resolve?.({ reason, conversationId });
  }

  function finalizeUnquotedCall(quote: VendorQuote, reason: "ended" | "declined") {
    const summary =
      reason === "declined"
        ? "Vendor declined or did not answer the role-play call; no quote was obtained."
        : "Call ended before a complete quote was confirmed; documented as no usable quote.";
    return finalizeVendorQuote(
      {
        ...quote,
        draftOutcomeKind: "documented_decline",
        notes: summary,
        transcriptTimestampSeconds: 0,
      },
      brief,
    );
  }

  async function extractQuoteFromTranscript(
    quote: VendorQuote,
    conversationId: string,
  ): Promise<VendorQuote | null> {
    try {
      const res = await fetch("/api/extract-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, currency: brief.currency }),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as {
        extracted: {
          outcomeKind: "itemized_quote" | "callback_commitment" | "documented_decline";
          summary: string;
          headlineTotal: number;
          components: VendorQuote["components"];
          depositPercent: number;
          cancellationDays: number;
          validUntilDays: number;
          callbackAt: string | null;
          notes: string;
        };
      };
      const e = payload.extracted;
      const validUntil = e.validUntilDays > 0
        ? new Date(Date.now() + e.validUntilDays * 86_400_000).toISOString().slice(0, 10)
        : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const patched: VendorQuote = {
        ...quote,
        draftOutcomeKind: e.outcomeKind,
        headlineTotal: e.headlineTotal || 0,
        components: e.components,
        depositPercent: Math.max(0, Math.min(100, e.depositPercent || 0)),
        cancellationDays: Math.max(0, e.cancellationDays || 0),
        validUntil,
        callbackAt: e.callbackAt ?? undefined,
        notes: e.notes || e.summary,
        missingComponents: [],
        transcriptTimestampSeconds: 0,
        transcriptUrl: `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`,
      };
      return finalizeVendorQuote(patched, brief);
    } catch (error) {
      console.error("[extract-quote] failed", error);
      return null;
    }
  }

  async function importByConversationId(quote: VendorQuote) {
    const conversationId = window.prompt(
      `Paste the ElevenLabs conversation_id for ${quote.vendorName}\n(from the ElevenLabs dashboard, starts with "conv_")`,
      "",
    );
    if (!conversationId?.trim()) return;
    setImportingId(quote.id);
    setCaptureError(undefined);
    const finalized = await extractQuoteFromTranscript(quote, conversationId.trim());
    setImportingId(null);
    if (finalized) {
      onUpdate(finalized);
    } else {
      setCaptureError(`Could not extract a quote from ${conversationId.trim()}.`);
    }
  }

  async function runAllCalls() {
    if (!brief.canonicalJson || !brief.contentHash || brief.status !== "confirmed") {
      setSeq((current) => ({
        ...current,
        error: "Confirm the frozen brief before starting calls.",
      }));
      return;
    }

    abortRef.current = { aborted: false };
    setSeq({ running: true, currentIndex: 0, log: [], error: undefined });

    for (let index = 0; index < quotes.length; index += 1) {
      if (abortRef.current.aborted) break;
      const quote = quotes[index];
      setSeq((current) => ({
        ...current,
        currentIndex: index,
        log: [...current.log, `Ringing ${quote.vendorName} in the browser...`],
      }));
      onUpdate({ ...quote, status: "calling", outcome: undefined });
      const reason = await waitForBrowserCall(quote);
      if (abortRef.current.aborted) break;
      onUpdate(finalizeUnquotedCall(quote, reason));
      setSeq((current) => ({
        ...current,
        log: [
          ...current.log,
          reason === "declined"
            ? `${quote.vendorName}: documented decline.`
            : `${quote.vendorName}: call ended without a finalized quote; documented for follow-up.`,
        ],
      }));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setSeq((current) => ({
      ...current,
      running: false,
      currentIndex: -1,
      log: [...current.log, "All calls now have structured outcomes."],
    }));
  }

  function stopAllCalls() {
    abortRef.current.aborted = true;
    if (resolveCallRef.current) finishCall("declined");
    setSeq((current) => ({ ...current, running: false }));
  }

  function updateActiveQuote(patch: Partial<VendorQuote>) {
    if (!activeQuote) return;
    setCaptureError(undefined);
    onUpdate({
      ...activeQuote,
      ...patch,
      status: "calling",
      outcome: undefined,
      evidence: [],
      negotiation: undefined,
    });
  }

  function updateComponent(key: QuoteComponentKey, value: number) {
    if (!activeQuote) return;
    updateActiveQuote({
      components: { ...activeQuote.components, [key]: value },
      missingComponents: activeQuote.missingComponents.filter((component) => component !== key),
    });
  }

  function saveStructuredOutcome() {
    if (!activeQuote) return;
    setCaptureError(undefined);
    try {
      onUpdate(finalizeVendorQuote(activeQuote, brief));
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not finalize this call.");
    }
  }

  const structuredCount = quotes.filter((quote) => Boolean(quote.outcome)).length;

  return (
    <section className="calls-layout">
      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Round one</span>
            <h2>Three distinct vendor conversations</h2>
          </div>
          <span className="status-pill">
            {structuredCount}/{quotes.length} structured
          </span>
        </div>
        <p className="panel-intro">
          Every call receives brief v{brief.version}, fingerprint {brief.contentHash?.slice(0, 12)}
          …, and the exact same canonical JSON. A call cannot count until it has an itemized quote,
          callback commitment, or documented decline.
        </p>

        <div className="voice-session sequential-call-card">
          <div className="voice-orb" aria-hidden="true">
            <PhoneOutgoing size={26} />
          </div>
          <div className="voice-session__copy">
            <strong>Sequential browser role-play calls</strong>
            <span>
              {seq.running
                ? `Calling ${seq.currentIndex + 1} of ${quotes.length}: ${quotes[seq.currentIndex]?.vendorName ?? ""}`
                : (seq.log.at(-1) ?? `Ready to call ${quotes.length} vendors.`)}
            </span>
          </div>
          <div className="voice-session__actions">
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
        {seq.error && <p className="error-note">{seq.error}</p>}

        {seq.log.length > 0 && (
          <ol className="call-sequence-log">
            {seq.log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        )}

        <div className="vendor-grid">
          {quotes.map((quote, index) => {
            const copy = personaCopy[quote.persona];
            const vendor = vendors?.[index];
            const isCurrent = seq.running && seq.currentIndex === index;
            return (
              <article
                className={`vendor-card ${activeQuoteId === quote.id ? "vendor-card--active" : ""} ${isCurrent ? "vendor-card--calling" : ""}`}
                key={quote.id}
              >
                <div className="vendor-card__top">
                  <span className="vendor-index">0{index + 1}</span>
                  {quote.outcome && <CheckCircle2 size={19} className="success-icon" />}
                </div>
                <input
                  className="vendor-name-input"
                  value={quote.vendorName}
                  onChange={(event) => onUpdate({ ...quote, vendorName: event.target.value })}
                  aria-label={`Vendor ${index + 1} name`}
                />
                {vendor?.address && <span className="vendor-meta">{vendor.address}</span>}
                {vendor?.rating != null && (
                  <span className="vendor-meta">
                    Rating {vendor.rating} ({vendor.reviewCount ?? 0} reviews)
                  </span>
                )}
                <span className="persona-label">
                  <UserRound size={14} /> Negotiation style: {copy.label}
                </span>
                <p>{copy.objective}</p>
                {quote.outcome && (
                  <span className="status-pill status-pill--success">
                    {outcomeLabels[quote.outcome.kind]}
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
              <strong>Private role-play instruction</strong>
              <span>{personaCopy[activeQuote.persona].objective}</span>
            </div>
          </div>
          <div className="canonical-call-proof">
            <strong>Exact frozen input</strong>
            <span>
              Brief v{brief.version} · SHA-256 {brief.contentHash?.slice(0, 16)}…
            </span>
          </div>
          <VoiceSession
            agentId={import.meta.env.VITE_ELEVENLABS_PROCUREMENT_AGENT_ID}
            label={`Lilly calling ${activeQuote.vendorName}`}
            dynamicVariables={buildDynamicVariables(brief, activeQuote)}
            onStarted={() => updateActiveQuote({ status: "calling" })}
          />

          <div className="quote-capture">
            <span className="kicker">Required structured call outcome</span>
            <label>
              <span>Outcome type</span>
              <select
                value={activeQuote.draftOutcomeKind}
                onChange={(event) =>
                  updateActiveQuote({ draftOutcomeKind: event.target.value as CallOutcomeKind })
                }
              >
                {Object.entries(outcomeLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {activeQuote.draftOutcomeKind === "itemized_quote" && (
              <>
                <div className="field-grid field-grid--compact">
                  <label>
                    <span>Headline total</span>
                    <input
                      type="number"
                      min="0"
                      value={activeQuote.headlineTotal}
                      onChange={(event) =>
                        updateActiveQuote({ headlineTotal: Number(event.target.value) })
                      }
                    />
                  </label>
                  {quoteComponentKeys.map((key) => (
                    <label key={key}>
                      <span>{key.replaceAll(/([A-Z])/g, " $1")}</span>
                      <input
                        type="number"
                        min="0"
                        value={activeQuote.components[key]}
                        onChange={(event) => updateComponent(key, Number(event.target.value))}
                      />
                    </label>
                  ))}
                  <label>
                    <span>Deposit percent</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={activeQuote.depositPercent}
                      onChange={(event) =>
                        updateActiveQuote({ depositPercent: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>Cancellation notice days</span>
                    <input
                      type="number"
                      min="0"
                      value={activeQuote.cancellationDays}
                      onChange={(event) =>
                        updateActiveQuote({ cancellationDays: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>Quote valid until</span>
                    <input
                      type="date"
                      value={activeQuote.validUntil}
                      onChange={(event) => updateActiveQuote({ validUntil: event.target.value })}
                    />
                  </label>
                </div>
                <button
                  className="button button--secondary button--wide"
                  type="button"
                  onClick={() => updateActiveQuote({ missingComponents: [] })}
                >
                  Confirm every line item was read back
                </button>
                {activeQuote.missingComponents.length > 0 && (
                  <p className="inline-note">
                    Still unconfirmed: {activeQuote.missingComponents.join(", ")}.
                  </p>
                )}
              </>
            )}

            {activeQuote.draftOutcomeKind === "callback_commitment" && (
              <label>
                <span>Promised callback</span>
                <input
                  type="datetime-local"
                  value={activeQuote.callbackAt ?? ""}
                  onChange={(event) => updateActiveQuote({ callbackAt: event.target.value })}
                />
              </label>
            )}

            <label>
              <span>Transcript evidence / outcome summary</span>
              <textarea
                value={activeQuote.notes}
                onChange={(event) => updateActiveQuote({ notes: event.target.value })}
              />
            </label>
            {activeQuote.draftOutcomeKind === "itemized_quote" && (
              <label>
                <span>Transcript read-back timestamp (seconds)</span>
                <input
                  type="number"
                  min="0"
                  value={activeQuote.transcriptTimestampSeconds ?? ""}
                  onChange={(event) =>
                    updateActiveQuote({ transcriptTimestampSeconds: Number(event.target.value) })
                  }
                />
              </label>
            )}
            <div className="field-grid field-grid--compact">
              <label>
                <span>Transcript URL (optional)</span>
                <input
                  type="url"
                  value={activeQuote.transcriptUrl ?? ""}
                  onChange={(event) => updateActiveQuote({ transcriptUrl: event.target.value })}
                />
              </label>
              <label>
                <span>Recording URL (optional)</span>
                <input
                  type="url"
                  value={activeQuote.recordingUrl ?? ""}
                  onChange={(event) => updateActiveQuote({ recordingUrl: event.target.value })}
                />
              </label>
            </div>
            {captureError && <p className="error-note">{captureError}</p>}
            <button
              className="button button--primary button--wide"
              type="button"
              onClick={saveStructuredOutcome}
            >
              <CheckCircle2 size={18} /> Validate and save outcome
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
