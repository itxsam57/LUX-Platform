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
  void input;
  void now;
  return false;
}

export function normalizePrebookRequest(
  input: PrebookRequestInput,
  supporterAnonymousByDefault: boolean,
): NormalizedPrebookRequest {
  void input;
  void supporterAnonymousByDefault;
  throw new Error("prebook_not_implemented");
}
