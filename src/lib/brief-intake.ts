import type { CateringBrief } from "../domain";

export type EditableBriefFields = Omit<
  CateringBrief,
  | "id"
  | "version"
  | "status"
  | "mayBook"
  | "intakeEvidence"
  | "canonicalJson"
  | "contentHash"
  | "confirmedAt"
>;

export interface RecordBriefFieldsParams {
  fields?: Partial<EditableBriefFields>;
}

const requiredBriefFields: Array<keyof EditableBriefFields> = [
  "eventType",
  "eventDate",
  "city",
  "guestCount",
  "serviceStyle",
  "menuPreference",
  "dietaryRequirements",
  "staffingHours",
  "targetBudget",
  "absoluteMaximum",
];

export function getMissingBriefFields(brief: CateringBrief) {
  return requiredBriefFields.filter((key) => {
    const value = brief[key];
    return typeof value === "number" ? value <= 0 : !String(value).trim();
  });
}

export function applyBriefFieldUpdate(brief: CateringBrief, fields: Partial<EditableBriefFields>) {
  const normalized: Partial<EditableBriefFields> = {};
  const stringFields = [
    "eventType",
    "eventDate",
    "city",
    "venueAddress",
    "serviceStyle",
    "menuPreference",
    "dietaryRequirements",
  ] as const;
  const numberFields = [
    "guestCount",
    "staffingHours",
    "targetBudget",
    "absoluteMaximum",
    "radiusKm",
  ] as const;

  for (const key of stringFields) {
    const value = fields[key];
    if (typeof value === "string") normalized[key] = value.trim();
  }
  for (const key of numberFields) {
    const value = fields[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      normalized[key] = value;
    }
  }
  if (fields.currency === "EUR" || fields.currency === "USD" || fields.currency === "GBP") {
    normalized.currency = fields.currency;
  }
  if (typeof fields.mayUseVerifiedLeverage === "boolean") {
    normalized.mayUseVerifiedLeverage = fields.mayUseVerifiedLeverage;
  }
  if (typeof fields.mayDiscloseTargetBudget === "boolean") {
    normalized.mayDiscloseTargetBudget = fields.mayDiscloseTargetBudget;
  }

  return {
    nextBrief: { ...brief, ...normalized, status: "draft" as const },
    updatedFields: Object.keys(normalized),
  };
}
