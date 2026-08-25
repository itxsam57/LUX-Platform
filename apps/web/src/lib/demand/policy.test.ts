import { describe, expect, it } from "vitest";

const POLICY_MODULE_PATH = "./policy";

async function loadDemandPolicy(): Promise<Record<string, unknown> | null> {
  try {
    return await import(POLICY_MODULE_PATH) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const validDraft = {
  title: "  A private rooftop scene  ",
  brief: "  A consensual adult creator concept with a clear short brief and no implied commitment.  ",
  category: " Creator_Idea ",
  format: " Short_Film ",
  suggestedCreatorHandle: "  Stage_Name  ",
  budget: {
    minMinor: 25_000,
    maxMinor: 75_000,
    currency: " usd ",
  },
  safetyLabels: [" Boundaries ", "adult_only", "boundaries"],
  expiresAt: "2026-09-25T12:00:00.000Z",
};

async function normalizeDraft(input: unknown, now = new Date("2026-08-25T12:00:00.000Z")) {
  const policy = await loadDemandPolicy();
  expect(policy, "Slice 6 demand policy module must exist").not.toBeNull();
  expect(policy?.normalizeDemandDraft, "normalizeDemandDraft must be exported").toBeTypeOf("function");

  return (policy?.normalizeDemandDraft as (value: unknown, clock?: Date) => unknown)(input, now);
}

describe("demand policy", () => {
  it("normalizes a valid demand without changing its meaning", async () => {
    await expect(normalizeDraft(validDraft)).resolves.toEqual({
      title: "A private rooftop scene",
      brief: "A consensual adult creator concept with a clear short brief and no implied commitment.",
      category: "creator_idea",
      format: "short_film",
      suggestedCreatorHandle: "stage_name",
      budget: {
        minMinor: 25_000,
        maxMinor: 75_000,
        currency: "USD",
      },
      safetyLabels: ["boundaries", "adult_only"],
      expiresAt: "2026-09-25T12:00:00.000Z",
    });
  });

  it("rejects empty, overlong, or control-character title and brief fields", async () => {
    await expect(normalizeDraft({ ...validDraft, title: "   " })).rejects.toThrow("invalid_demand_title");
    await expect(normalizeDraft({ ...validDraft, title: "x".repeat(121) })).rejects.toThrow("invalid_demand_title");
    await expect(normalizeDraft({ ...validDraft, brief: "short" })).rejects.toThrow("invalid_demand_brief");
    await expect(normalizeDraft({ ...validDraft, brief: `valid enough brief ${String.fromCharCode(7)}` })).rejects.toThrow("invalid_demand_brief");
  });

  it("accepts only canonical category, format, handle, and safety-label slugs", async () => {
    await expect(normalizeDraft({ ...validDraft, category: "<script>" })).rejects.toThrow("invalid_demand_category");
    await expect(normalizeDraft({ ...validDraft, format: "x" })).rejects.toThrow("invalid_demand_format");
    await expect(normalizeDraft({ ...validDraft, suggestedCreatorHandle: "Bad Handle!" })).rejects.toThrow("invalid_suggested_creator_handle");
    await expect(normalizeDraft({ ...validDraft, safetyLabels: ["ok", "not valid!"] })).rejects.toThrow("invalid_demand_safety_labels");
    await expect(normalizeDraft({ ...validDraft, safetyLabels: Array.from({ length: 9 }, (_, index) => `label_${index}`) })).rejects.toThrow("invalid_demand_safety_labels");
  });

  it("requires a complete non-negative ordered budget range with an ISO currency", async () => {
    await expect(normalizeDraft({ ...validDraft, budget: { minMinor: 10_000, maxMinor: 9_999, currency: "USD" } })).rejects.toThrow("invalid_demand_budget");
    await expect(normalizeDraft({ ...validDraft, budget: { minMinor: -1, maxMinor: 10_000, currency: "USD" } })).rejects.toThrow("invalid_demand_budget");
    await expect(normalizeDraft({ ...validDraft, budget: { minMinor: 10_000, maxMinor: 20_000, currency: "US" } })).rejects.toThrow("invalid_demand_budget");
    await expect(normalizeDraft({ ...validDraft, budget: { minMinor: 10_000, currency: "USD" } })).rejects.toThrow("invalid_demand_budget");
  });

  it("requires a valid future expiry when expiry is supplied", async () => {
    await expect(normalizeDraft({ ...validDraft, expiresAt: "not-a-date" })).rejects.toThrow("invalid_demand_expiry");
    await expect(normalizeDraft({ ...validDraft, expiresAt: "2026-08-25T12:00:00.000Z" })).rejects.toThrow("invalid_demand_expiry");
    await expect(normalizeDraft({ ...validDraft, expiresAt: "2026-08-25T11:59:59.000Z" })).rejects.toThrow("invalid_demand_expiry");
  });

  it("keeps optional creator, budget, labels, and expiry absent instead of fabricating values", async () => {
    await expect(normalizeDraft({
      title: "A creator-led concept",
      brief: "A sufficiently detailed adult creator request that communicates interest without commitment.",
      category: "concept",
      format: "video",
    })).resolves.toEqual({
      title: "A creator-led concept",
      brief: "A sufficiently detailed adult creator request that communicates interest without commitment.",
      category: "concept",
      format: "video",
      suggestedCreatorHandle: null,
      budget: null,
      safetyLabels: [],
      expiresAt: null,
    });
  });
});
