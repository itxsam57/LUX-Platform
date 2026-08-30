export type PrebookCampaignState =
  | "draft"
  | "review_ready"
  | "published"
  | "funding_closed"
  | "cancelled";

export type SupporterVisibility = "default" | "anonymous" | "public";

export interface PrebookEligibilityInput {
  campaignState: PrebookCampaignState;
  deadline: string;
  paymentEnvironmentEligible: boolean;
  projectRestricted: boolean;
}

export interface PrebookRequestInput {
  amountMinor: number;
  supporterVisibility: SupporterVisibility;
  badgeChoice?: string | null;
  idempotencyKey: string;
}

export interface NormalizedPrebookRequest {
  amountMinor: number;
  supporterAnonymous: boolean;
  badgeChoice: string | null;
  idempotencyKey: string;
}

export function canCreatePrebook(
  input: PrebookEligibilityInput,
  now: Date = new Date(),
): boolean {
  if (
    input.campaignState !== "published" ||
    !input.paymentEnvironmentEligible ||
    input.projectRestricted
  ) {
    return false;
  }

  const deadline = new Date(input.deadline);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() > now.getTime();
}

export function normalizePrebookRequest(
  input: PrebookRequestInput,
  supporterAnonymousByDefault: boolean,
): NormalizedPrebookRequest {
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    input.amountMinor > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("invalid_prebook_amount");
  }

  if (!(["default", "anonymous", "public"] as const).includes(input.supporterVisibility)) {
    throw new Error("invalid_supporter_visibility");
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(idempotencyKey)
  ) {
    throw new Error("invalid_prebook_idempotency_key");
  }

  const badgeChoice = input.badgeChoice?.trim() || null;
  if (
    badgeChoice !== null &&
    (badgeChoice.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(badgeChoice))
  ) {
    throw new Error("invalid_badge_choice");
  }

  const supporterAnonymous =
    input.supporterVisibility === "anonymous" ||
    (input.supporterVisibility === "default" && supporterAnonymousByDefault);

  return {
    amountMinor: input.amountMinor,
    supporterAnonymous,
    badgeChoice,
    idempotencyKey,
  };
}
