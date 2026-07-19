import { CheckCircle2, Handshake, PhoneOutgoing, ShieldCheck, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CateringBrief,
  NegotiationPlan,
  NormalizedQuote,
  VendorQuote,
} from "../domain";
import { finalizeVendorQuote, formatMoney } from "../lib/procurement";
import { BrowserPhoneCall, type BrowserCallRequest } from "./BrowserPhoneCall";

interface NegotiationProps {
  brief: CateringBrief;
  finalists: NormalizedQuote[];
  plans: Record<string, NegotiationPlan | undefined>;
  onUpdate: (quote: VendorQuote) => void;
  onAllDone: () => void;
}

interface SeqState {
  running: boolean;
  currentIndex: number;
  log: string[];
  error?: string;
  done: boolean;
}

const retryDelaysMs = [1_500, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000];
function wait(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms));
}

function relativeWhen(iso?: string) {
  if (!iso) return "recently";
  const then = new Date(iso);
  const now = new Date();
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return "earlier today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === y.getFullYear() &&
    then.getMonth() === y.getMonth() &&
    then.getDate() === y.getDate();
  if (isYesterday) return "yesterday";
  return then.toLocaleDateString();
}

function buildCounterOfferFirstMessage(
  finalist: NormalizedQuote,
  plan: NegotiationPlan,
  brief: CateringBrief,
) {
  const when = relativeWhen(finalist.outcome?.finalizedAt);
  const previousTotal = formatMoney(
    finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
    brief.currency,
  );
  return `Hi, this is Lilly, the AI event planning assistant. We spoke ${when} about the catering for the event, and you shared a quote around ${previousTotal}. I'm coming back to you because you're one of our finalists. ${plan.permittedClaim} Would you be able to ${plan.targetRequest.toLowerCase()} while keeping the same scope? Am I still speaking with ${finalist.vendorName}?`;
}

function buildDynamicVariables(
  brief: CateringBrief,
  finalist: NormalizedQuote,
  plan: NegotiationPlan,
) {
  return {
    campaign_id: brief.id,
    brief_id: brief.id,
    brief_version: brief.version,
    brief_hash: brief.contentHash ?? "",
    canonical_brief_json: brief.canonicalJson ?? "",
    call_session_id: `${finalist.id}-negotiation`,
    call_mode: "NEGOTIATION_CALLBACK",
    vendor_name: finalist.vendorName,
    negotiation_plan_json: JSON.stringify(plan),
  } as Record<string, string | number | boolean>;
}

async function extractQuote(conversationId: string, currency: CateringBrief["currency"]) {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const res = await fetch("/api/extract-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, currency }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => undefined)) as
          | { retryable?: boolean; error?: string; detail?: string }
          | undefined;
        const retryable = payload?.retryable === true || res.status === 425;
        if (!retryable || attempt === retryDelaysMs.length) {
          throw new Error(payload?.error || `Extraction failed (${res.status})`);
        }
        await wait(retryDelaysMs[attempt]);
        continue;
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
      return payload.extracted;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Extraction failed");
      if (attempt === retryDelaysMs.length) break;
      await wait(retryDelaysMs[attempt]);
    }
  }
  throw lastError ?? new Error("Extraction failed");
}

export function Negotiation({ brief, finalists, plans, onUpdate, onAllDone }: NegotiationProps) {
  const abortRef = useRef({ aborted: false });
  const resolveRef = useRef<
    ((r: { reason: "ended" | "declined"; conversationId: string | null }) => void) | null
  >(null);
  const [currentCall, setCurrentCall] = useState<BrowserCallRequest | null>(null);
  const [seq, setSeq] = useState<SeqState>({
    running: false,
    currentIndex: -1,
    log: [],
    done: false,
  });

  useEffect(
    () => () => {
      abortRef.current.aborted = true;
    },
    [],
  );

  if (finalists.length < 2) {
    return (
      <section className="panel empty-state">
        <Handshake size={40} />
        <strong>Select at least two vendors to negotiate</strong>
        <span>Go back to Compare and check the vendors you want to push for a better offer.</span>
      </section>
    );
  }

  const missingPlan = finalists.find((f) => !plans[f.id]);

  function waitForCall(request: BrowserCallRequest): Promise<{
    reason: "ended" | "declined";
    conversationId: string | null;
  }> {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setCurrentCall(request);
    });
  }

  function finishCall(reason: "ended" | "declined", conversationId: string | null = null) {
    setCurrentCall(null);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.({ reason, conversationId });
  }

  async function runAll() {
    abortRef.current = { aborted: false };
    setSeq({ running: true, currentIndex: 0, log: [], done: false, error: undefined });

    let completed = 0;
    for (let index = 0; index < finalists.length; index += 1) {
      if (abortRef.current.aborted) break;
      const finalist = finalists[index];
      const plan = plans[finalist.id];
      if (!plan) {
        setSeq((s) => ({
          ...s,
          log: [...s.log, `${finalist.vendorName}: skipped (no supported counter-offer plan).`],
        }));
        continue;
      }

      setSeq((s) => ({
        ...s,
        currentIndex: index,
        log: [...s.log, `Calling ${finalist.vendorName} back with a counter-offer...`],
      }));

      const firstMessage = buildCounterOfferFirstMessage(finalist, plan, brief);
      const { reason, conversationId } = await waitForCall({
        vendorName: finalist.vendorName,
        dynamicVariables: buildDynamicVariables(brief, finalist, plan),
        firstMessage,
      });
      if (abortRef.current.aborted) break;

      if (reason === "declined" || !conversationId) {
        const message = `${finalist.vendorName}: call was not answered; keeping the original offer.`;
        onUpdate({
          ...finalist,
          status: "negotiated",
          negotiatedChange: "No answer on callback; original offer kept.",
          initialNormalizedTotal:
            finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
          negotiation: {
            initialTotal: finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
            finalTotal: finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
            delta: 0,
            changedTerms: "No answer on callback; original offer kept.",
            leverageEvidenceId: plan.leverageEvidenceId,
            finalizedAt: new Date().toISOString(),
          },
        });
        setSeq((s) => ({ ...s, log: [...s.log, message] }));
        continue;
      }

      setSeq((s) => ({
        ...s,
        log: [...s.log, `Extracting ${finalist.vendorName} counter-offer from transcript...`],
      }));

      try {
        const extracted = await extractQuote(conversationId, brief.currency);
        const initialTotal = finalist.initialNormalizedTotal ?? finalist.normalizedTotal;
        const isItemized = extracted.outcomeKind === "itemized_quote";
        const newComponents = isItemized ? extracted.components : finalist.components;
        const newFinalTotal = Object.values(newComponents).reduce(
          (sum, v) => sum + Math.max(v, 0),
          0,
        );
        const delta = newFinalTotal - initialTotal;
        const finalizedAt = new Date().toISOString();
        const validUntil =
          isItemized && extracted.validUntilDays > 0
            ? new Date(Date.now() + extracted.validUntilDays * 86_400_000)
                .toISOString()
                .slice(0, 10)
            : finalist.validUntil;

        // Rebuild as a fresh captured quote first (so evidence + outcome match), then mark negotiated.
        const rebuiltDraft: VendorQuote = {
          ...finalist,
          headlineTotal: isItemized
            ? extracted.headlineTotal || newFinalTotal
            : finalist.headlineTotal,
          components: newComponents,
          depositPercent: isItemized
            ? Math.max(0, Math.min(100, extracted.depositPercent || finalist.depositPercent))
            : finalist.depositPercent,
          cancellationDays: isItemized
            ? Math.max(0, extracted.cancellationDays || finalist.cancellationDays)
            : finalist.cancellationDays,
          validUntil,
          notes: extracted.notes || extracted.summary || finalist.notes,
          draftOutcomeKind: isItemized ? "itemized_quote" : finalist.draftOutcomeKind,
          missingComponents: [],
          transcriptTimestampSeconds: 0,
          transcriptUrl: `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`,
        };
        const finalized = finalizeVendorQuote(rebuiltDraft, brief);

        onUpdate({
          ...finalized,
          status: "negotiated",
          initialNormalizedTotal: initialTotal,
          negotiatedChange: extracted.notes || extracted.summary,
          negotiation: {
            initialTotal,
            finalTotal: newFinalTotal,
            delta,
            changedTerms: extracted.notes || extracted.summary || "Counter-offer captured.",
            leverageEvidenceId: plan.leverageEvidenceId,
            finalizedAt,
          },
        });
        completed += 1;
        setSeq((s) => ({
          ...s,
          log: [
            ...s.log,
            `${finalist.vendorName}: ${
              isItemized
                ? `updated total ${formatMoney(newFinalTotal, brief.currency)} (${formatMoney(delta, brief.currency)}).`
                : "no improvement captured; keeping original."
            }`,
          ],
        }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Extraction failed.";
        setSeq((s) => ({
          ...s,
          log: [...s.log, `${finalist.vendorName}: could not process transcript. ${detail}`],
        }));
        onUpdate({
          ...finalist,
          status: "negotiated",
          initialNormalizedTotal:
            finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
          negotiatedChange: "Transcript could not be processed; original offer kept.",
          negotiation: {
            initialTotal: finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
            finalTotal: finalist.initialNormalizedTotal ?? finalist.normalizedTotal,
            delta: 0,
            changedTerms: "Transcript could not be processed; original offer kept.",
            leverageEvidenceId: plan.leverageEvidenceId,
            finalizedAt: new Date().toISOString(),
          },
        });
      }
      await wait(500);
    }

    setSeq((s) => ({
      ...s,
      running: false,
      currentIndex: -1,
      done: true,
      log: [...s.log, `Counter-offer round finished (${completed} improvements captured).`],
    }));
  }

  function stopAll() {
    abortRef.current.aborted = true;
    if (resolveRef.current) finishCall("declined", null);
    setSeq((s) => ({ ...s, running: false }));
  }

  return (
    <section className="workspace-grid">
      <div className="panel">
        <div className="eyebrow">
          <Target size={15} /> Counter-offer round
        </div>
        <h1>Lilly will call each selected vendor back with a specific ask.</h1>
        <p className="lede">
          For every finalist, Lilly uses the strongest of the other selected offers as leverage,
          reintroduces herself, and asks for a measurable improvement without changing the event
          scope.
        </p>

        {missingPlan && (
          <p className="error-note">
            {missingPlan.vendorName} has no cheaper selected alternative to leverage. Lilly will
            still call, but without a specific counter-offer plan. Add at least one lower-priced
            vendor to the selection for a stronger ask.
          </p>
        )}

        <div className="negotiation-list">
          {finalists.map((f, i) => {
            const plan = plans[f.id];
            const initialTotal = f.initialNormalizedTotal ?? f.normalizedTotal;
            const done = f.status === "negotiated" && Boolean(f.negotiation);
            const finalTotal = f.negotiation?.finalTotal ?? initialTotal;
            const delta = f.negotiation?.delta ?? 0;
            return (
              <article key={f.id} className={done ? "vendor-card vendor-card--done" : "vendor-card"}>
                <div className="vendor-card__top">
                  <span className="vendor-index">0{i + 1}</span>
                  <span className={`vendor-state ${done ? "vendor-state--ready" : ""}`}>
                    {done ? <CheckCircle2 size={15} /> : null}
                    {done ? "Counter-offer captured" : "Awaiting callback"}
                  </span>
                </div>
                <strong>{f.vendorName}</strong>
                <span className="vendor-meta">
                  Original {formatMoney(initialTotal, brief.currency)}
                  {done &&
                    ` → ${formatMoney(finalTotal, brief.currency)} (${formatMoney(delta, brief.currency)})`}
                </span>
                {plan ? (
                  <>
                    <div className="claim-card claim-card--compact">
                      <ShieldCheck size={17} />
                      <div>
                        <strong>Leverage</strong>
                        <span>“{plan.permittedClaim}”</span>
                      </div>
                    </div>
                    <span className="persona-label">The ask: {plan.targetRequest}</span>
                  </>
                ) : (
                  <span className="persona-label">
                    No cheaper alternative selected — asking for goodwill only.
                  </span>
                )}
              </article>
            );
          })}
        </div>

        <div className="voice-session sequential-call-card">
          <div className="voice-orb" aria-hidden="true">
            <PhoneOutgoing size={26} />
          </div>
          <div className="voice-session__copy">
            <strong>Run counter-offer calls back-to-back</strong>
            <span>
              {seq.running
                ? `Calling ${seq.currentIndex + 1} of ${finalists.length}: ${
                    finalists[seq.currentIndex]?.vendorName ?? ""
                  }`
                : (seq.log.at(-1) ??
                  `Ready to call back ${finalists.length} vendors with counter-offers.`)}
            </span>
          </div>
          <div className="voice-session__actions">
            {seq.running ? (
              <button className="button button--secondary" type="button" onClick={stopAll}>
                Stop
              </button>
            ) : seq.done ? (
              <button className="button button--primary" type="button" onClick={onAllDone}>
                See final recommendation
              </button>
            ) : (
              <button className="button button--primary" type="button" onClick={runAll}>
                <PhoneOutgoing size={17} /> Start counter-offer calls
              </button>
            )}
          </div>
        </div>
        {seq.error && <p className="error-note">{seq.error}</p>}

        {seq.log.length > 0 && (
          <ol className="call-sequence-log">
            {seq.log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        )}
      </div>

      <BrowserPhoneCall
        call={currentCall}
        onDeclined={() => finishCall("declined", null)}
        onEnded={(conversationId) => finishCall("ended", conversationId)}
      />
    </section>
  );
}
