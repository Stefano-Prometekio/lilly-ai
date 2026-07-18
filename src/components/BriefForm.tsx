import { CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";
import { useConversationClientTool } from "@elevenlabs/react";
import type { CateringBrief } from "../domain";
import {
  applyBriefFieldUpdate,
  getMissingBriefFields,
  type RecordBriefFieldsParams,
} from "../lib/brief-intake";
import { VoiceSession } from "./VoiceSession";

interface BriefFormProps {
  brief: CateringBrief;
  onChange: (brief: CateringBrief) => void;
  onConfirm: () => void;
}

export function BriefForm({ brief, onChange, onConfirm }: BriefFormProps) {
  const update = <K extends keyof CateringBrief>(key: K, value: CateringBrief[K]) =>
    onChange({ ...brief, [key]: value });
  const confirmed = brief.status === "confirmed";
  const missingFields = getMissingBriefFields(brief);
  const readyToConfirm = missingFields.length === 0;

  useConversationClientTool("record_brief_fields", ({ fields }: RecordBriefFieldsParams) => {
    if (!fields || brief.status === "confirmed") {
      return JSON.stringify({
        success: false,
        reason: "The brief is frozen or no fields were supplied.",
      });
    }
    const { nextBrief, updatedFields } = applyBriefFieldUpdate(brief, fields);
    onChange(nextBrief);
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

  useConversationClientTool("mark_intake_ready_for_review", () =>
    JSON.stringify({
      success: readyToConfirm,
      missingFields,
      instruction: readyToConfirm
        ? "The visible draft is ready for the buyer to review and confirm."
        : "Continue intake one question at a time until the missing fields are supplied.",
    }),
  );

  return (
    <section className="workspace-grid workspace-grid--intake">
      <div className="panel panel--hero">
        <div className="eyebrow">
          <Sparkles size={15} /> Voice-guided intake
        </div>
        <h1>Tell Lilly what you need.</h1>
        <p className="lede">
          Speak naturally while Lilly turns your event into one complete, comparable specification.
          You remain in control of every field.
        </p>

        <VoiceSession
          agentId={import.meta.env.VITE_ELEVENLABS_INTAKE_AGENT_ID}
          label="Lilly, your procurement partner"
          dynamicVariables={{
            brief_id: brief.id,
            brief_version: brief.version,
            call_mode: "INTAKE",
            agent_name: "Lilly",
          }}
        />

        <div className="trust-row">
          <span>
            <LockKeyhole size={15} /> You approve the final brief
          </span>
          <span>
            <CheckCircle2 size={15} /> Lilly cannot place a booking
          </span>
        </div>
      </div>

      <div className="panel form-panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Canonical brief</span>
            <h2>Event requirements</h2>
          </div>
          <span className={`status-pill ${confirmed ? "status-pill--success" : ""}`}>
            {confirmed ? `Confirmed v${brief.version}` : "Draft"}
          </span>
        </div>

        <div className="field-grid">
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
              onChange={(e) => update("eventDate", e.target.value)}
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
            <span>Guest count</span>
            <input
              type="number"
              min="1"
              value={brief.guestCount || ""}
              disabled={confirmed}
              onChange={(e) => update("guestCount", Number(e.target.value))}
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

        <div className="authority-card">
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
            <span>Booking authority is disabled for this MVP.</span>
          </div>
        </div>

        {!confirmed ? (
          <button
            className="button button--primary button--wide"
            type="button"
            onClick={onConfirm}
            disabled={!readyToConfirm}
          >
            <CheckCircle2 size={18} /> Confirm brief and freeze version
          </button>
        ) : (
          <button
            className="button button--secondary button--wide"
            type="button"
            onClick={() => onChange({ ...brief, status: "draft", version: brief.version + 1 })}
          >
            Create an amended version
          </button>
        )}
        {!confirmed && !readyToConfirm && (
          <p className="inline-note">
            Still needed:{" "}
            {missingFields
              .join(", ")
              .replaceAll(/([A-Z])/g, " $1")
              .toLowerCase()}
            .
          </p>
        )}
      </div>
    </section>
  );
}
