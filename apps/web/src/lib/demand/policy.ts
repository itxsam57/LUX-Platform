export type DemandBudget = {
  minMinor: number;
  maxMinor: number;
  currency: string;
};

export type DemandDraft = {
  title: string;
  brief: string;
  category: string;
  format: string;
  suggestedCreatorHandle: string | null;
  budget: DemandBudget | null;
  safetyLabels: string[];
  expiresAt: string | null;
};

const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const slugPattern = /^[a-z0-9][a-z0-9_-]{1,47}$/;
const safetyLabelPattern = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const handlePattern = /^[a-z0-9_]{3,30}$/;
const currencyPattern = /^[A-Z]{3}$/;

function fail(code: string): never {
  throw new Error(code);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_demand_input");
  }
  return value as Record<string, unknown>;
}

function normalizeText(
  value: unknown,
  code: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    fail(code);
  }

  const normalized = value.trim();
  if (
    normalized.length < minimum
    || normalized.length > maximum
    || controlCharacterPattern.test(normalized)
  ) {
    fail(code);
  }

  return normalized;
}

function normalizeSlug(value: unknown, code: string): string {
  if (typeof value !== "string") {
    fail(code);
  }
  const normalized = value.trim().toLowerCase();
  if (!slugPattern.test(normalized)) {
    fail(code);
  }
  return normalized;
}

function normalizeSuggestedCreatorHandle(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    fail("invalid_suggested_creator_handle");
  }
  const normalized = value.trim().toLowerCase();
  if (!handlePattern.test(normalized)) {
    fail("invalid_suggested_creator_handle");
  }
  return normalized;
}

function normalizeBudget(value: unknown): DemandBudget | null {
  if (value === undefined || value === null) {
    return null;
  }

  const budget = asRecord(value);
  const minMinor = budget.minMinor;
  const maxMinor = budget.maxMinor;
  const currency = typeof budget.currency === "string"
    ? budget.currency.trim().toUpperCase()
    : "";

  if (
    !Number.isSafeInteger(minMinor)
    || !Number.isSafeInteger(maxMinor)
    || (minMinor as number) < 0
    || (maxMinor as number) < (minMinor as number)
    || !currencyPattern.test(currency)
  ) {
    fail("invalid_demand_budget");
  }

  return {
    minMinor: minMinor as number,
    maxMinor: maxMinor as number,
    currency,
  };
}

function normalizeSafetyLabels(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 8) {
    fail("invalid_demand_safety_labels");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") {
      fail("invalid_demand_safety_labels");
    }
    const label = candidate.trim().toLowerCase();
    if (!safetyLabelPattern.test(label)) {
      fail("invalid_demand_safety_labels");
    }
    if (!seen.has(label)) {
      seen.add(label);
      normalized.push(label);
    }
  }

  return normalized;
}

function normalizeExpiry(value: unknown, now: Date): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    fail("invalid_demand_expiry");
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
    fail("invalid_demand_expiry");
  }

  return parsed.toISOString();
}

export function normalizeDemandDraft(input: unknown, now = new Date()): DemandDraft {
  const draft = asRecord(input);

  return {
    title: normalizeText(draft.title, "invalid_demand_title", 4, 120),
    brief: normalizeText(draft.brief, "invalid_demand_brief", 20, 1200),
    category: normalizeSlug(draft.category, "invalid_demand_category"),
    format: normalizeSlug(draft.format, "invalid_demand_format"),
    suggestedCreatorHandle: normalizeSuggestedCreatorHandle(draft.suggestedCreatorHandle),
    budget: normalizeBudget(draft.budget),
    safetyLabels: normalizeSafetyLabels(draft.safetyLabels),
    expiresAt: normalizeExpiry(draft.expiresAt, now),
  };
}
