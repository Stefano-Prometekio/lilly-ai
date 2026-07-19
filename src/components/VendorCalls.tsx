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

const transcriptRetryDelaysMs = [1_500, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000];

class QuoteExtractionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "QuoteExtractionError";
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function describeExtractionError(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object") return `Quote extraction failed (${status}).`;
  const record = payload as Record<string, unknown>;
  const detail = typeof record.detail === "string" ? record.detail : undefined;
  const message = typeof record.error === "string" ? record.error : undefined;
  return [message, detail].filter(Boolean).join(": ") || `Quote extraction failed (${status}).`;
}

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
  const [importDialogQuoteId, setImportDialogQuoteId] = useState<string>();
  const [conversationIdInput, setConversationIdInput] = useState("");
  const [bulkIds, setBulkIds] = useState<string[]>(() => quotes.map(() => ""));
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkLog, setBulkLog] = useState<string[]>([]);

  useEffect(() => {
    setBulkIds((current) => quotes.map((_, index) => current[index] ?? ""));
  }, [quotes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runBulkImport() {
    setBulkRunning(true);
    setBulkLog([]);
    setCaptureError(undefined);
    for (let index = 0; index < quotes.length; index += 1) {
      const id = bulkIds[index]?.trim();
      const quote = quotes[index];
      if (!id || !quote) continue;
      setBulkLog((current) => [...current, `Reading ${quote.vendorName} (${id})...`]);
      try {
        const finalized = await extractQuoteFromTranscript(quote, id);
        onUpdate(finalized);
        setBulkLog((current) => [
          ...current,
          `${quote.vendorName}: imported (${finalized.outcome?.kind ?? "unknown"}).`,
        ]);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "extraction failed";
        setBulkLog((current) => [...current, `${quote.vendorName}: ${detail}`]);
      }
    }
    setBulkRunning(false);
  }

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
  ): Promise<VendorQuote> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= transcriptRetryDelaysMs.length; attempt += 1) {
      try {
        const res = await fetch("/api/extract-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, currency: brief.currency }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => undefined)) as
            | { retryable?: boolean }
            | undefined;
          throw new QuoteExtractionError(
            describeExtractionError(payload, res.status),
            payload?.retryable === true || res.status === 425,
          );
        }
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
        const validUntil =
          e.validUntilDays > 0
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
        lastError = error instanceof Error ? error : new Error("Quote extraction failed.");
        const canRetry =
          !(lastError instanceof QuoteExtractionError) || lastError.retryable === true;
        if (!canRetry || attempt === transcriptRetryDelaysMs.length) break;
        await wait(transcriptRetryDelaysMs[attempt]);
      }
    }

    console.error("[extract-quote] failed", { conversationId, error: lastError });
    throw lastError ?? new Error("Quote extraction failed.");
  }

  async function importByConversationId(quote: VendorQuote, conversationId: string) {
    if (!conversationId.trim()) return;
    setImportingId(quote.id);
    setImportDialogQuoteId(undefined);
    setConversationIdInput("");
    setCaptureError(undefined);
    try {
      const finalized = await extractQuoteFromTranscript(quote, conversationId.trim());
      onUpdate(finalized);
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : `Could not extract a quote from ${conversationId.trim()}.`,
      );
    } finally {
      setImportingId(null);
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

    let completedCalls = 0;
    for (let index = 0; index < quotes.length; index += 1) {
      if (abortRef.current.aborted) break;
      const quote = quotes[index];
      setSeq((current) => ({
        ...current,
        currentIndex: index,
        log: [...current.log, `Ringing ${quote.vendorName} in the browser...`],
      }));
      onUpdate({ ...quote, status: "calling", outcome: undefined });
      const { reason, conversationId } = await waitForBrowserCall(quote);
      if (abortRef.current.aborted) break;

      let finalized: VendorQuote;
      let logLine = "";
      if (reason === "ended") {
        if (!conversationId) {
          const message = `${quote.vendorName}: ElevenLabs ended the call without providing a conversation ID. The call was not marked as a decline.`;
          setCaptureError(message);
          setSeq((current) => ({ ...current, error: message, log: [...current.log, message] }));
          onUpdate({ ...quote, status: "not-started", outcome: undefined });
          break;
        }
        setSeq((current) => ({
          ...current,
          log: [...current.log, `Extracting quote from ${quote.vendorName} transcript...`],
        }));
        try {
          finalized = await extractQuoteFromTranscript(quote, conversationId);
          logLine = `${quote.vendorName}: quote captured from transcript (${finalized.outcome?.kind ?? "unknown"}).`;
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Quote extraction failed.";
          const message = `${quote.vendorName}: the call was saved, but its transcript could not be processed. ${detail}`;
          setCaptureError(message);
          setSeq((current) => ({ ...current, error: message, log: [...current.log, message] }));
          onUpdate({
            ...quote,
            status: "not-started",
            outcome: undefined,
            transcriptUrl: `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`,
          });
          break;
        }
      } else {
        finalized = finalizeUnquotedCall(quote, reason);
        logLine = `${quote.vendorName}: documented decline.`;
      }
      onUpdate(finalized);
      completedCalls += 1;
      setSeq((current) => ({ ...current, log: [...current.log, logLine] }));
      await wait(500);
    }
    setSeq((current) => ({
      ...current,
      running: false,
      currentIndex: -1,
      log:
        completedCalls === quotes.length
          ? [...current.log, "All calls now have structured outcomes."]
          : current.log,
    }));
  }

  function stopAllCalls() {
    abortRef.current.aborted = true;
    if (resolveCallRef.current) finishCall("declined", null);
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
            <span className="kicker">Vendor outreach</span>
            <h2>Gather three comparable offers</h2>
          </div>
          <span className="status-pill">
            {structuredCount} of {quotes.length} ready
          </span>
        </div>
        <p className="panel-intro">
          Lilly shares the same confirmed event brief with every vendor, so the offers stay fair and
          comparable. Each conversation ends with a quote, a callback, or a clear decline.
        </p>

        <div className="voice-session sequential-call-card">
          <div className="voice-orb" aria-hidden="true">
            <PhoneOutgoing size={26} />
          </div>
          <div className="voice-session__copy">
            <strong>Contact vendors one at a time</strong>
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
                <PhoneOutgoing size={17} /> Start vendor outreach
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

        <details className="technical-proof technical-proof--compact" style={{ marginTop: 16 }}>
          <summary>
            <span>
              <strong>Test Compare with past calls</strong>
              <small>
                Paste ElevenLabs conversation IDs to reuse existing transcripts instead of
                re-calling every vendor.
              </small>
            </span>
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {quotes.map((quote, index) => (
              <label key={quote.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>
                  {index + 1}. {quote.vendorName}
                </span>
                <input
                  type="text"
                  placeholder="conv_..."
                  value={bulkIds[index] ?? ""}
                  onChange={(event) =>
                    setBulkIds((current) => {
                      const next = [...current];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                />
              </label>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="button button--primary"
                type="button"
                onClick={runBulkImport}
                disabled={
                  bulkRunning ||
                  !bulkIds.some((id) => id.trim().startsWith("conv_")) ||
                  !brief.contentHash
                }
              >
                {bulkRunning ? "Importing..." : "Import all conversations"}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={bulkRunning}
                onClick={() =>
                  setBulkIds([
                    "conv_4701kxwaxgr0fswv7a10w7w31s67",
                    "conv_6401kxwb4shzf25bdt5g3kt583fh",
                    "conv_6501kxwb63bcfx09kk6m0jtwa6s1",
                  ])
                }
              >
                Fill with recent demo IDs
              </button>
            </div>
            {bulkLog.length > 0 && (
              <ol className="call-sequence-log">
                {bulkLog.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            )}
          </div>
        </details>

        <div className="vendor-grid">
          {quotes.map((quote, index) => {
            const copy = personaCopy[quote.persona];
            const vendor = vendors?.[index];
            const isCurrent = seq.running && seq.currentIndex === index;
            const statusLabel = quote.outcome
              ? outcomeLabels[quote.outcome.kind]
              : isCurrent
                ? "Calling now"
                : "Ready to contact";
            return (
              <article
                className={`vendor-card ${activeQuoteId === quote.id ? "vendor-card--active" : ""} ${isCurrent ? "vendor-card--calling" : ""}`}
                key={quote.id}
              >
                <div className="vendor-card__top">
                  <span className="vendor-index">0{index + 1}</span>
                  <span className={`vendor-state ${quote.outcome ? "vendor-state--ready" : ""}`}>
                    {quote.outcome && <CheckCircle2 size={15} />}
                    {statusLabel}
                  </span>
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
                  <UserRound size={14} /> Conversation style: {copy.label}
                </span>
                <p>{copy.objective}</p>
                <button
                  className="button button--secondary button--wide"
                  type="button"
                  onClick={() => onActivate(quote.id)}
                >
                  <Headphones size={17} /> Review vendor conversation
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={importingId === quote.id}
                  onClick={() => {
                    setImportDialogQuoteId(quote.id);
                    setConversationIdInput("");
                  }}
                >
                  {importingId === quote.id
                    ? "Reading conversation..."
                    : "Use an existing conversation"}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {activeQuote && (
        <div className="call-room-shell" role="presentation">
          <div
            className="panel call-room"
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-vendor-call-title"
          >
            <div className="section-heading">
              <div>
                <span className="kicker">Vendor conversation</span>
                <h2 id="active-vendor-call-title">{activeQuote.vendorName}</h2>
              </div>
              <button className="text-button" type="button" onClick={() => onActivate(undefined)}>
                Close
              </button>
            </div>
            <div className="persona-brief">
              <ClipboardPen size={18} />
              <div>
                <strong>Conversation guidance</strong>
                <span>{personaCopy[activeQuote.persona].objective}</span>
              </div>
            </div>
            <details className="technical-proof technical-proof--compact">
              <summary>
                <span>
                  <strong>Same confirmed brief for every vendor</strong>
                  <small>
                    Plan v{brief.version} · verification {brief.contentHash?.slice(0, 12)}…
                  </small>
                </span>
              </summary>
              <p>
                Lilly reuses this exact confirmed version for every conversation so that vendor
                offers can be compared fairly.
              </p>
            </details>
            <VoiceSession
              agentId={import.meta.env.VITE_ELEVENLABS_PROCUREMENT_AGENT_ID}
              label={`Lilly calling ${activeQuote.vendorName}`}
              dynamicVariables={buildDynamicVariables(brief, activeQuote)}
              onStarted={() => updateActiveQuote({ status: "calling" })}
            />

            <div className="quote-capture">
              <span className="kicker">Conversation outcome</span>
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
                <span>Conversation summary and supporting excerpt</span>
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
                <CheckCircle2 size={18} /> Save vendor outcome
              </button>
            </div>
          </div>
        </div>
      )}
      <BrowserPhoneCall
        call={currentCall}
        onDeclined={() => finishCall("declined", null)}
        onEnded={(conversationId) => finishCall("ended", conversationId)}
      />
      {importDialogQuoteId && (
        <div className="call-dialog-backdrop" role="presentation">
          <div
            className="call-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-import-title"
          >
            <span className="call-dialog__icon">
              <Headphones size={20} />
            </span>
            <span className="kicker">Existing conversation</span>
            <h2 id="conversation-import-title">Add a completed vendor call</h2>
            <p>
              Paste the ElevenLabs conversation ID for{" "}
              {quotes.find((quote) => quote.id === importDialogQuoteId)?.vendorName}.
            </p>
            <label>
              <span>Conversation ID</span>
              <input
                autoFocus
                value={conversationIdInput}
                placeholder="conv_..."
                onChange={(event) => setConversationIdInput(event.target.value)}
              />
            </label>
            <div className="call-dialog__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setImportDialogQuoteId(undefined)}
              >
                Cancel
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={!conversationIdInput.trim().startsWith("conv_")}
                onClick={() => {
                  const quote = quotes.find((item) => item.id === importDialogQuoteId);
                  if (quote) void importByConversationId(quote, conversationIdInput);
                }}
              >
                Read conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
