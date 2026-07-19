import { describe, expect, it, vi } from "vitest";
import {
  confirmCanonicalBrief,
  hashCanonicalBrief,
  serializeCanonicalBrief,
} from "./canonical-brief";
import { initialBrief } from "./procurement";

const completeBrief = {
  ...initialBrief,
  eventType: "Wedding",
  eventDate: "2026-09-18",
  city: "Brussels",
  guestCount: 100,
  serviceStyle: "Plated dinner",
  menuPreference: "Seasonal",
  dietaryRequirements: "Nut-free",
  staffingHours: 6,
  targetBudget: 5_000,
  absoluteMaximum: 7_000,
  intakeEvidence: {
    voiceInterviewCompleted: true,
    documents: [
      {
        id: "document-1",
        name: "brief.json",
        mimeType: "application/json",
        extractedFields: ["guestCount"],
        importedAt: "2026-07-19T00:00:00.000Z",
      },
    ],
  },
};

describe("canonical brief confirmation", () => {
  it("freezes a stable JSON snapshot and SHA-256 fingerprint", async () => {
    const confirmed = await confirmCanonicalBrief(completeBrief);

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.canonicalJson).toBe(serializeCanonicalBrief(completeBrief));
    expect(confirmed.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("allows confirmation without voice or document evidence when fields are complete", async () => {
    await expect(
      confirmCanonicalBrief({
        ...completeBrief,
        intakeEvidence: { voiceInterviewCompleted: false, documents: [] },
      }),
    ).resolves.toMatchObject({ status: "confirmed" });
  });

  it("produces a valid SHA-256 hash when Web Crypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(hashCanonicalBrief("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    vi.unstubAllGlobals();
  });
});
