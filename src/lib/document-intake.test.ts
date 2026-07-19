import { describe, expect, it } from "vitest";
import { parseBriefDocument } from "./document-intake";

describe("document intake", () => {
  it("parses a JSON brief into the same editable schema as voice intake", () => {
    const fields = parseBriefDocument(
      "brief.json",
      "application/json",
      JSON.stringify({ guestCount: 120, city: "Brussels", dietary: "Nut-free" }),
    );

    expect(fields).toEqual({
      guestCount: 120,
      city: "Brussels",
      dietaryRequirements: "Nut-free",
    });
  });

  it("parses key-value CSV or text inventory documents", () => {
    const fields = parseBriefDocument(
      "inventory.csv",
      "text/csv",
      "guests,85\nservice style,buffet\nmaximum budget,6000",
    );

    expect(fields.guestCount).toBe(85);
    expect(fields.serviceStyle).toBe("buffet");
    expect(fields.absoluteMaximum).toBe(6000);
  });
});
