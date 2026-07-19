import { useState } from "react";
import { CheckCircle2, FileJson2, FlaskConical, LockKeyhole, Sparkles } from "lucide-react";
import { useConversationClientTool } from "@elevenlabs/react";
import type { CateringBrief } from "../domain";
import {
  applyBriefFieldUpdate,
  getMissingBriefFields,
  type RecordBriefFieldsParams,
} from "../lib/brief-intake";
import { VoiceSession } from "./VoiceSession";
import { LocationMap } from "./LocationMap";
import { amendCanonicalBrief } from "../lib/canonical-brief";
import { parseBriefDocument } from "../lib/document-intake";

interface BriefFormProps {
  brief: CateringBrief;
  onChange: (brief: CateringBrief) => void;
  onConfirm: () => Promise<void>;
  onLoadDemo: () => Promise<void>;
}

export function BriefForm({ brief, onChange, onConfirm, onLoadDemo }: BriefFormProps) {
  const [documentError, setDocumentError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();
  const update = <K extends keyof CateringBrief>(key: K, value: CateringBrief[K]) =>
    onChange({ ...brief, [key]: value });
  const confirmed = brief.status === "confirmed";
  const missingFields = getMissingBriefFields(brief);
  const fieldsReady = missingFields.length === 0;
  const voiceReady = brief.intakeEvidence.voiceInterviewCompleted;
  const documentReady = brief.intakeEvidence.documents.length > 0;
  const readyToConfirm = fieldsReady;

  useConversationClientTool("record_brief_fields", ({ fields }: RecordBriefFieldsParams) => {
    if (!fields || brief.status === "confirmed") {
      return JSON.stringify({
        success: false,
        reason: "The brief is frozen or no fields were supplied.",
      });
    }
    const { nextBrief, updatedFields } = applyBriefFieldUpdate(brief, fields);
    onChange({
      ...nextBrief,
      intakeEvidence: { ...nextBrief.intakeEvidence, voiceInterviewCompleted: true },
    });
    return JSON.stringify({
      success: true,
      updatedFields,
      missingFields: getMissingBriefFields(nextBrief),
    });
  });

  useConversationClientTool("get_intake_state", () =>
    JSON.stringify({
      brief: {
        eventType: brief.eventType,
        eventDate: brief.eventDate,
        city: brief.city,
        venueAddress: brief.venueAddress,
        guestCount: brief.guestCount,
        serviceStyle: brief.serviceStyle,
        menuPreference: brief.menuPreference,
        dietaryRequirements: brief.dietaryRequirements,
        staffingHours: brief.staffingHours,
        targetBudget: brief.targetBudget,
        absoluteMaximum: brief.absoluteMaximum,
        radiusKm: brief.radiusKm,
        currency: brief.currency,
        mayUseVerifiedLeverage: brief.mayUseVerifiedLeverage,
        mayDiscloseTargetBudget: brief.mayDiscloseTargetBudget,
      },
      missingFields,
    }),
  );

  useConversationClientTool("mark_intake_ready_for_review", () => {
    if (fieldsReady && !brief.intakeEvidence.voiceInterviewCompleted) {
      onChange({
        ...brief,
        intakeEvidence: { ...brief.intakeEvidence, voiceInterviewCompleted: true },
      });
    }
    return JSON.stringify({
      success: fieldsReady,
      missingFields,
      instruction: fieldsReady
        ? "The visible draft is ready for document import and buyer confirmation."
        : "Continue intake one question at a time until the missing fields are supplied.",
    });
  });

  async function handleDocument(file?: File) {
    if (!file || confirmed) return;
    setDocumentError(undefined);
    try {
      const lowerName = file.name.toLowerCase();
      const isRichDoc =
        lowerName.endsWith(".pdf") ||
        lowerName.endsWith(".docx") ||
        lowerName.endsWith(".pptx") ||
        file.type === "application/pdf" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

      let fields: Partial<Parameters<typeof applyBriefFieldUpdate>[1]>;
      if (isRichDoc) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/parse-brief-document", {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as {
          fields?: Record<string, unknown>;
          error?: string;
        };
        if (!response.ok || !payload.fields) {
          throw new Error(payload.error || "Document parsing failed.");
        }
        fields = payload.fields as typeof fields;
      } else {
        fields = parseBriefDocument(file.name, file.type, await file.text());
      }

      const { nextBrief, updatedFields } = applyBriefFieldUpdate(brief, fields);
      if (!updatedFields.length) {
        throw new Error("No recognized catering brief fields were found in this document.");
      }
      onChange({
        ...nextBrief,
        intakeEvidence: {
          ...nextBrief.intakeEvidence,
          documents: [
            ...nextBrief.intakeEvidence.documents,
            {
              id: `document-${Date.now().toString(36)}`,
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              extractedFields: updatedFields,
              importedAt: new Date().toISOString(),
            },
          ],
        },
      });
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Document import failed.");
    }
  }

  async function handleConfirm() {
    setConfirmationError(undefined);
    try {
      await onConfirm();
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : "Brief confirmation failed.");
    }
  }

  return (
    <section className="workspace-grid workspace-grid--intake">
      <div className="panel panel--hero">
        <div className="eyebrow">
          <Sparkles size={15} /> Guided event planning
        </div>
        <h1>Tell Lilly about your event.</h1>
        <p className="lede">
          Talk it through, import what you already have, or fill in the details yourself. Lilly
          turns it into one clear brief that every vendor can respond to fairly.
        </p>

        <VoiceSession
          agentId={import.meta.env.VITE_ELEVENLABS_INTAKE_AGENT_ID}
          label="Lilly, your event planning assistant"
          dynamicVariables={{
            brief_id: brief.id,
            brief_version: brief.version,
            call_mode: "INTAKE",
            agent_name: "Lilly",
          }}
        />

        <div className="intake-source-card">
          <div>
            <FileJson2 size={18} />
            <span>
              <strong>Already have an event document?</strong>
              <small>Import a PDF, Word, PowerPoint, JSON, CSV, or text file.</small>
            </span>
          </div>
          <label className="button button--secondary document-button">
            Choose document
            <input
              type="file"
              accept=".json,.csv,.txt,.pdf,.docx,.pptx,application/json,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              disabled={confirmed}
              onChange={(event) => void handleDocument(event.currentTarget.files?.[0])}
            />
          </label>
          {documentError && <p className="error-note">{documentError}</p>}
          {brief.intakeEvidence.documents.map((document) => (
            <div className="document-proof" key={document.id}>
              <CheckCircle2 size={15} />
              <span>
                {document.name} · {document.extractedFields.length} fields imported
              </span>
            </div>
          ))}
        </div>

        <button className="button button--quiet button--wide" type="button" onClick={onLoadDemo}>
          <FlaskConical size={17} /> Preview with a sample event
        </button>

        <div className="trust-row">
          <span>
            <LockKeyhole size={15} /> You approve the final event plan
          </span>
          <span>
            <CheckCircle2 size={15} /> Lilly cannot place a booking
          </span>
          <span className={voiceReady ? "success-text" : ""}>
            <CheckCircle2 size={15} /> Voice interview {voiceReady ? "recorded" : "optional"}
          </span>
          <span className={documentReady ? "success-text" : ""}>
            <CheckCircle2 size={15} /> Document {documentReady ? "imported" : "optional"}
          </span>
        </div>
      </div>

      <div className="panel form-panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Your event brief</span>
            <h2>Event details</h2>
          </div>
          <span className={`status-pill ${confirmed ? "status-pill--success" : ""}`}>
            {confirmed ? `Confirmed v${brief.version}` : "Draft"}
          </span>
        </div>

        <div className={`brief-completion ${readyToConfirm ? "brief-completion--ready" : ""}`}>
          <div className="brief-completion__ring" aria-hidden="true">
            {readyToConfirm ? <CheckCircle2 size={22} /> : <span>{missingFields.length}</span>}
          </div>
          <div>
            <strong>
              {readyToConfirm ? "Your brief is ready to confirm" : "Complete your event brief"}
            </strong>
            <span>
              {readyToConfirm
                ? "Review the details below, then lock this version for vendor outreach."
                : `${missingFields.length} ${missingFields.length === 1 ? "detail is" : "details are"} still needed.`}
            </span>
          </div>
        </div>

        <div className="form-section-heading">
          <span>01</span>
          <div>
            <strong>Event essentials</strong>
            <small>When and where the event will happen</small>
          </div>
        </div>
        <div className="field-grid form-section-fields">
          <label>
            <span>Event type</span>
            <input
              value={brief.eventType}
              disabled={confirmed}
              onChange={(e) => update("eventType", e.target.value)}
            />
          </label>
          <label>
            <span>Event date</span>
            <input
              type="date"
              value={brief.eventDate}
              disabled={confirmed}
              onInput={(e) => update("eventDate", e.currentTarget.value)}
            />
          </label>
          <label className="field-grid__wide">
            <span>City or venue area</span>
            <input
              value={brief.city}
              disabled={confirmed}
              onChange={(e) => update("city", e.target.value)}
            />
          </label>
          <label className="field-grid__wide">
            <span>Venue address (if known)</span>
            <input
              value={brief.venueAddress}
              disabled={confirmed}
              onChange={(e) => update("venueAddress", e.target.value)}
            />
          </label>
          <label>
            <span>Search radius (km)</span>
            <input
              type="number"
              min="1"
              value={brief.radiusKm}
              disabled={confirmed}
              onChange={(e) => update("radiusKm", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="form-section-heading">
          <span>02</span>
          <div>
            <strong>Guests, food, and service</strong>
            <small>The experience vendors should price</small>
          </div>
        </div>
        <div className="field-grid form-section-fields">
          <label>
            <span>Guest count</span>
            <input
              type="number"
              min="1"
              value={brief.guestCount || ""}
              disabled={confirmed}
              onChange={(e) => update("guestCount", Number(e.target.value))}
            />
          </label>
          <label className="field-grid__wide">
            <span>Service style</span>
            <input
              value={brief.serviceStyle}
              disabled={confirmed}
              onChange={(e) => update("serviceStyle", e.target.value)}
            />
          </label>
          <label className="field-grid__wide">
            <span>Menu preference</span>
            <input
              value={brief.menuPreference}
              disabled={confirmed}
              onChange={(e) => update("menuPreference", e.target.value)}
            />
          </label>
          <label className="field-grid__wide">
            <span>Dietary and allergy requirements</span>
            <textarea
              value={brief.dietaryRequirements}
              disabled={confirmed}
              onChange={(e) => update("dietaryRequirements", e.target.value)}
            />
          </label>
          <label>
            <span>Staffing hours</span>
            <input
              type="number"
              min="0"
              value={brief.staffingHours || ""}
              disabled={confirmed}
              onChange={(e) => update("staffingHours", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="form-section-heading">
          <span>03</span>
          <div>
            <strong>Budget</strong>
            <small>Your preferred range and firm limit</small>
          </div>
        </div>
        <div className="field-grid form-section-fields">
          <label>
            <span>Currency</span>
            <select
              value={brief.currency}
              disabled={confirmed}
              onChange={(e) => update("currency", e.target.value as CateringBrief["currency"])}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label>
            <span>Target budget</span>
            <input
              type="number"
              min="0"
              value={brief.targetBudget || ""}
              disabled={confirmed}
              onChange={(e) => update("targetBudget", Number(e.target.value))}
            />
          </label>
          <label>
            <span>Absolute maximum</span>
            <input
              type="number"
              min="0"
              value={brief.absoluteMaximum || ""}
              disabled={confirmed}
              onChange={(e) => update("absoluteMaximum", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="brief-map-block">
          <div className="map-section-heading">
            <div>
              <span className="kicker">Where Lilly should look</span>
              <h3>Venue and vendor search area</h3>
            </div>
            <span>Updates with the location and radius above</span>
          </div>
          <LocationMap
            location={brief.venueAddress.trim() || brief.city}
            radiusKm={brief.radiusKm}
          />
        </div>

        <div className="authority-card">
          <div className="authority-card__heading">
            <span>04</span>
            <div>
              <strong>Conversation preferences</strong>
              <small>Decide what Lilly may share with vendors</small>
            </div>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={brief.mayUseVerifiedLeverage}
              disabled={confirmed}
              onChange={(e) => update("mayUseVerifiedLeverage", e.target.checked)}
            />
            <span>Lilly may cite verified competing offers without naming the vendor.</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={brief.mayDiscloseTargetBudget}
              disabled={confirmed}
              onChange={(e) => update("mayDiscloseTargetBudget", e.target.checked)}
            />
            <span>Lilly may disclose the target budget when useful.</span>
          </label>
          <div className="check-row check-row--locked">
            <LockKeyhole size={16} />
            <span>Lilly cannot place a booking or commit on your behalf.</span>
          </div>
        </div>

        {!confirmed ? (
          <button
            className="button button--primary button--wide"
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!readyToConfirm}
          >
            <CheckCircle2 size={18} /> Confirm this event brief
          </button>
        ) : (
          <button
            className="button button--secondary button--wide"
            type="button"
            onClick={() => onChange(amendCanonicalBrief(brief))}
          >
            Update this event brief
          </button>
        )}
        {!confirmed && !readyToConfirm && (
          <p className="inline-note">
            Still needed:{" "}
            {[
              ...missingFields.map((field) => field.replaceAll(/([A-Z])/g, " $1").toLowerCase()),
            ].join(", ")}
            .
          </p>
        )}
        {confirmationError && <p className="error-note">{confirmationError}</p>}
      </div>
    </section>
  );
}
