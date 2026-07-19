import { ArrowDownRight, CheckCircle2, Handshake, ShieldCheck, Target } from "lucide-react";
import { useEffect, useState } from "react";
import type { CateringBrief, NegotiationPlan, NormalizedQuote, VendorQuote } from "../domain";
import { formatMoney } from "../lib/procurement";
import { VoiceSession } from "./VoiceSession";

interface NegotiationProps {
  brief: CateringBrief;
  finalist?: NormalizedQuote;
  plan?: NegotiationPlan;
  onUpdate: (quote: VendorQuote) => void;
}

export function Negotiation({ brief, finalist, plan, onUpdate }: NegotiationProps) {
  const [newDeliveryFee, setNewDeliveryFee] = useState(0);
  const [newCancellationDays, setNewCancellationDays] = useState(0);
  const [changedTerms, setChangedTerms] = useState("");
  const [transcriptEvidence, setTranscriptEvidence] = useState("");
  const [transcriptTimestamp, setTranscriptTimestamp] = useState<number | "">("");
  const [transcriptUrl, setTranscriptUrl] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setNewDeliveryFee(finalist?.components.delivery ?? 0);
    setNewCancellationDays(finalist?.cancellationDays ?? 0);
    setChangedTerms("");
    setTranscriptEvidence("");
    setTranscriptTimestamp("");
    setTranscriptUrl("");
    setRecordingUrl("");
    setError(undefined);
  }, [finalist?.id, finalist?.components.delivery, finalist?.cancellationDays]);

  if (!finalist || !plan) {
    return (
      <section className="panel empty-state">
        <Handshake size={40} />
        <strong>No evidence-eligible negotiation plan</strong>
        <span>
          Select a finalist with a lower, transcript-backed alternative on the same confirmed brief.
        </span>
      </section>
    );
  }

  const selectedFinalist = finalist;
  const activePlan = plan;

  const initialTotal = selectedFinalist.initialNormalizedTotal ?? selectedFinalist.normalizedTotal;
  const finalTotal =
    selectedFinalist.normalizedTotal -
    selectedFinalist.components.delivery +
    Math.max(0, newDeliveryFee);
  const delta = finalTotal - initialTotal;
  const priceChanged = newDeliveryFee !== selectedFinalist.components.delivery;
  const termsChanged = newCancellationDays !== selectedFinalist.cancellationDays;
  const improved =
    selectedFinalist.status === "negotiated" && Boolean(selectedFinalist.negotiation);

  function confirmFinalOffer() {
    setError(undefined);
    if (!priceChanged && !termsChanged) {
      setError("Record a measurable price or commercial-term change before finalizing.");
      return;
    }
    if (!changedTerms.trim()) {
      setError("Explain exactly what changed and confirm that the scope stayed intact.");
      return;
    }
    if (!transcriptEvidence.trim() || transcriptTimestamp === "") {
      setError("Add transcript evidence and the timestamp of the final read-back.");
      return;
    }

    const finalizedAt = new Date().toISOString();
    const negotiationEvidence = [
      {
        id: `${selectedFinalist.id}-negotiation-transcript`,
        kind: "transcript" as const,
        label: `${selectedFinalist.vendorName} negotiation read-back`,
        excerpt: transcriptEvidence.trim(),
        timestampSeconds: transcriptTimestamp,
        url: transcriptUrl.trim() || undefined,
        callSessionId: `${selectedFinalist.id}-negotiation`,
      },
      ...(recordingUrl.trim()
        ? [
            {
              id: `${selectedFinalist.id}-negotiation-recording`,
              kind: "recording" as const,
              label: `${selectedFinalist.vendorName} negotiation recording`,
              url: recordingUrl.trim(),
              callSessionId: `${selectedFinalist.id}-negotiation`,
            },
          ]
        : []),
    ];

    onUpdate({
      ...selectedFinalist,
      status: "negotiated",
      components: {
        ...selectedFinalist.components,
        delivery: Math.max(0, newDeliveryFee),
      },
      cancellationDays: Math.max(0, newCancellationDays),
      initialNormalizedTotal: initialTotal,
      negotiatedChange: changedTerms.trim(),
      negotiation: {
        initialTotal,
        finalTotal,
        delta,
        changedTerms: changedTerms.trim(),
        leverageEvidenceId: activePlan.leverageEvidenceId,
        finalizedAt,
      },
      evidence: [...selectedFinalist.evidence, ...negotiationEvidence],
      recordingUrl: recordingUrl.trim() || selectedFinalist.recordingUrl,
      transcriptUrl: transcriptUrl.trim() || selectedFinalist.transcriptUrl,
    });
  }

  return (
    <section className="workspace-grid">
      <div className="panel">
        <div className="eyebrow">
          <Target size={15} /> Frozen evidence plan
        </div>
        <h1>Make one precise, provable ask.</h1>
        <p className="lede">
          The plan is tied to brief fingerprint {plan.briefHash.slice(0, 12)}… and evidence item{" "}
          {plan.leverageEvidenceId}. The agent receives the permitted claim, not a free-form bid.
        </p>

        <div className="negotiation-plan">
          <div>
            <span>Finalist</span>
            <strong>{finalist.vendorName}</strong>
          </div>
          <div>
            <span>Initial normalized total</span>
            <strong>{formatMoney(initialTotal, brief.currency)}</strong>
          </div>
          <div>
            <span>Verified alternative</span>
            <strong>{formatMoney(plan.alternativeTotal, brief.currency)}</strong>
          </div>
          <div>
            <span>Evidence-backed gap</span>
            <strong>{formatMoney(initialTotal - plan.alternativeTotal, brief.currency)}</strong>
          </div>
        </div>

        <div className="claim-card">
          <ShieldCheck size={19} />
          <div>
            <strong>Permitted claim</strong>
            <span>“{plan.permittedClaim}”</span>
          </div>
        </div>
        <div className="target-ask">
          <ArrowDownRight size={22} />
          <div>
            <span>Targeted request</span>
            <strong>{plan.targetRequest}</strong>
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
            brief_hash: brief.contentHash ?? "",
            canonical_brief_json: brief.canonicalJson ?? "",
            call_session_id: `${finalist.id}-negotiation`,
            call_mode: "NEGOTIATION_CALLBACK",
            vendor_name: finalist.vendorName,
            negotiation_plan_json: JSON.stringify(plan),
          }}
        />

        <div className="quote-capture">
          <span className="kicker">Record the measured final version</span>
          <div className="field-grid field-grid--compact">
            <label>
              <span>New delivery fee</span>
              <input
                type="number"
                min="0"
                value={newDeliveryFee}
                onChange={(event) => setNewDeliveryFee(Number(event.target.value))}
              />
            </label>
            <label>
              <span>New cancellation notice days</span>
              <input
                type="number"
                min="0"
                value={newCancellationDays}
                onChange={(event) => setNewCancellationDays(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="negotiation-delta">
            <span>Measured change</span>
            <strong>
              {formatMoney(initialTotal, brief.currency)} →{" "}
              {formatMoney(finalTotal, brief.currency)} ({formatMoney(delta, brief.currency)})
            </strong>
          </div>
          <label>
            <span>What changed and why?</span>
            <textarea
              value={changedTerms}
              onChange={(event) => setChangedTerms(event.target.value)}
            />
          </label>
          <label>
            <span>Final read-back transcript evidence</span>
            <textarea
              value={transcriptEvidence}
              onChange={(event) => setTranscriptEvidence(event.target.value)}
            />
          </label>
          <label>
            <span>Transcript timestamp (seconds)</span>
            <input
              type="number"
              min="0"
              value={transcriptTimestamp}
              onChange={(event) => setTranscriptTimestamp(Number(event.target.value))}
            />
          </label>
          <div className="field-grid field-grid--compact">
            <label>
              <span>Transcript URL (optional)</span>
              <input
                type="url"
                value={transcriptUrl}
                onChange={(event) => setTranscriptUrl(event.target.value)}
              />
            </label>
            <label>
              <span>Recording URL (optional)</span>
              <input
                type="url"
                value={recordingUrl}
                onChange={(event) => setRecordingUrl(event.target.value)}
              />
            </label>
          </div>
          {error && <p className="error-note">{error}</p>}
          <button
            className="button button--primary button--wide"
            type="button"
            onClick={confirmFinalOffer}
          >
            <CheckCircle2 size={18} /> Validate and save final offer version
          </button>
        </div>
      </div>
    </section>
  );
}
