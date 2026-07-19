import { describe, expect, it } from "vitest";
import { initialBrief } from "./procurement";
import { applyBriefFieldUpdate, getMissingBriefFields } from "./brief-intake";

describe("voice intake brief updates", () => {
  it("updates only the fields supplied by Lilly and trims spoken text", () => {
    const { nextBrief, updatedFields } = applyBriefFieldUpdate(initialBrief, {
      eventType: "  Product launch  ",
      guestCount: 85,
    });

    expect(nextBrief.eventType).toBe("Product launch");
    expect(nextBrief.guestCount).toBe(85);
    expect(nextBrief.city).toBe("");
    expect(updatedFields).toEqual(["eventType", "guestCount"]);
  });

  it("rejects invalid values instead of overwriting the visible draft", () => {
    const populated = { ...initialBrief, guestCount: 100, radiusKm: 25 };
    const { nextBrief, updatedFields } = applyBriefFieldUpdate(populated, {
      guestCount: Number.NaN,
      radiusKm: -10,
    });

    expect(nextBrief.guestCount).toBe(100);
    expect(nextBrief.radiusKm).toBe(25);
    expect(updatedFields).toEqual([]);
  });

  it("marks a complete spoken brief as ready for confirmation", () => {
    const complete = {
      ...initialBrief,
      eventType: "Wedding reception",
      eventDate: "2026-09-18",
      city: "Brussels",
      guestCount: 120,
      serviceStyle: "Plated dinner",
      menuPreference: "Seasonal Belgian",
      dietaryRequirements: "No nuts; vegetarian options",
      staffingHours: 6,
      targetBudget: 6_000,
      absoluteMaximum: 7_000,
    };

    expect(getMissingBriefFields(complete)).toEqual([]);
  });
});
