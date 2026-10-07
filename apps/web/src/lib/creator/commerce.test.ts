import { describe, expect, it } from "vitest";
import { parseAvailabilityInput, parseCreatorCommerce, parseOfferInput } from "./commerce";

describe("creator commerce policy", () => {
  it("parses a safe public projection", () => {
    expect(parseCreatorCommerce({
      availability: { status: "available", nextAvailableAt: null, note: "Open to short-form work." },
      offers: [{
        publicId: "off" + "a".repeat(24),
        title: "Performance session",
        description: "A clearly scoped voluntary performance collaboration offer.",
        category: "performance",
        roleName: "performer",
        startingMinor: 5000,
        currency: "USD",
      }],
    })?.offers).toHaveLength(1);
  });

  it("normalizes availability and offer inputs", () => {
    expect(parseAvailabilityInput({ status: "limited", nextAvailableAt: "", note: "Weekends only." })).toEqual({
      status: "limited", nextAvailableAt: null, note: "Weekends only.",
    });
    expect(parseOfferInput({
      title: " Editing package ",
      description: " A defined post-production editing offer with clear scope and voluntary acceptance. ",
      category: " Post_Production ",
      roleName: " Editor ",
      startingMinor: "10000",
      currency: "usd",
    })).toMatchObject({ title: "Editing package", category: "post_production", roleName: "editor", startingMinor: 10000, currency: "USD" });
  });
});
