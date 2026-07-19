import type { EditableBriefFields } from "./brief-intake";

const aliases: Record<string, keyof EditableBriefFields> = {
  eventtype: "eventType",
  event: "eventType",
  eventdate: "eventDate",
  date: "eventDate",
  city: "city",
  location: "city",
  venueaddress: "venueAddress",
  address: "venueAddress",
  guestcount: "guestCount",
  guests: "guestCount",
  servicestyle: "serviceStyle",
  service: "serviceStyle",
  menupreference: "menuPreference",
  menu: "menuPreference",
  dietaryrequirements: "dietaryRequirements",
  dietary: "dietaryRequirements",
  allergies: "dietaryRequirements",
  staffinghours: "staffingHours",
  targetbudget: "targetBudget",
  absolutemaximum: "absoluteMaximum",
  maximumbudget: "absoluteMaximum",
  radiuskm: "radiusKm",
  currency: "currency",
};

const numericFields = new Set<keyof EditableBriefFields>([
  "guestCount",
  "staffingHours",
  "targetBudget",
  "absoluteMaximum",
  "radiusKm",
]);

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function convertValue(key: keyof EditableBriefFields, value: unknown) {
  if (numericFields.has(key)) {
    const numeric =
      typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (key === "currency") {
    const currency = String(value).trim().toUpperCase();
    return currency === "EUR" || currency === "USD" || currency === "GBP" ? currency : undefined;
  }
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : undefined;
}

function toEditableFields(record: Record<string, unknown>) {
  const fields: Partial<EditableBriefFields> = {};
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = aliases[normalizeKey(rawKey)];
    if (!key) continue;
    const value = convertValue(key, rawValue);
    if (value !== undefined) Object.assign(fields, { [key]: value });
  }
  return fields;
}

function parseDelimited(text: string) {
  const record: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.includes(":") ? ":" : line.includes(",") ? "," : undefined;
    if (!separator) continue;
    const [key, ...rest] = line.split(separator);
    if (key?.trim() && rest.length) record[key.trim()] = rest.join(separator).trim();
  }
  return record;
}

export function parseBriefDocument(fileName: string, mimeType: string, text: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  let raw: Record<string, unknown>;
  if (extension === "json" || mimeType.includes("json")) {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The JSON document must contain one object of catering brief fields.");
    }
    raw = parsed as Record<string, unknown>;
  } else if (extension === "csv" || extension === "txt" || mimeType.startsWith("text/")) {
    raw = parseDelimited(text);
  } else {
    throw new Error("Supported intake documents are JSON, CSV, and plain text.");
  }

  const fields = toEditableFields(raw);
  if (!Object.keys(fields).length) {
    throw new Error("No recognized catering brief fields were found in this document.");
  }
  return fields;
}
