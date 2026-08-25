"use client";

import { useActionState } from "react";
import {
  acknowledgeConsentEducationAction,
  startVerificationAction,
  type ConsentEducationActionState,
  type VerificationActionState,
} from "@/app/settings/verification/actions";
import { Badge, Button, Status } from "@/components/ui/primitives";
import type { VerificationProviderMode, VerificationStatus } from "@/lib/verification/types";

type LevelSummary = {
  status: VerificationStatus;
  current: boolean;
  expiresAt: string | null;
  recheckReason: string | null;
};

type V3PrerequisitesView = {
  v2Current: boolean;
  performerRecordActive: boolean;
  livenessCurrent: boolean;
  payoutOwnershipVerified: boolean;
  consentEducationAcknowledged: boolean;
  consentEducationVersion: string | null;
};

export type VerificationSummaryView = {
  v1Current: boolean;
  v2: LevelSummary;
  v3: LevelSummary & { prerequisites: V3PrerequisitesView };
};

const INITIAL_VERIFICATION_ACTION_STATE: VerificationActionState = {
  status: "idle",
  message: "",
  level: null,
  verificationStatus: null,
};

const INITIAL_CONSENT_ACTION_STATE: ConsentEducationActionState = {
  status: "idle",
  message: "",
  acknowledged: false,
};

const STATUS_LABELS: Record<VerificationStatus, string> = {
  not_started: "Not started",
  pending: "Pending review",
  needs_review: "Needs review",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
};

function statusTone(status: VerificationStatus): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "verified") return "success";
  if (status === "pending" || status === "needs_review") return "warning";
  if (status === "rejected" || status === "expired" || status === "revoked") return "danger";
  return "neutral";
}

function displayStatus(
  initial: VerificationStatus,
  actionLevel: "v2" | "v3",
  actionState: VerificationActionState,
): VerificationStatus {
  return actionState.level === actionLevel && actionState.verificationStatus
    ? actionState.verificationStatus
    : initial;
}

function formatExpiry(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function ActionMessage({ state }: { state: Pick<VerificationActionState | ConsentEducationActionState, "status" | "message"> }) {
  if (!state.message) return null;
  return (
    <p
      className={state.status === "error" ? "auth-message auth-message--error" : "auth-message auth-message--success"}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function Prerequisite({ met, children }: { met: boolean; children: string }) {
  return (
    <li className="verification-prerequisite">
      <span className={met ? "verification-prerequisite__mark verification-prerequisite__mark--met" : "verification-prerequisite__mark"} aria-hidden="true">
        {met ? "✓" : "○"}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function VerificationPanel({
  summary,
  provider,
}: {
  summary: VerificationSummaryView;
  provider: { mode: VerificationProviderMode; label: string };
}) {
  const [v2ActionState, v2Action, v2Pending] = useActionState(
    startVerificationAction,
    INITIAL_VERIFICATION_ACTION_STATE,
  );
  const [v3ActionState, v3Action, v3Pending] = useActionState(
    startVerificationAction,
    INITIAL_VERIFICATION_ACTION_STATE,
  );
  const [consentState, consentAction, consentPending] = useActionState(
    acknowledgeConsentEducationAction,
    INITIAL_CONSENT_ACTION_STATE,
  );

  const v2Status = displayStatus(summary.v2.status, "v2", v2ActionState);
  const v3Status = displayStatus(summary.v3.status, "v3", v3ActionState);
  const consentAcknowledged = summary.v3.prerequisites.consentEducationAcknowledged || consentState.acknowledged;
  const v3Eligible = summary.v3.prerequisites.v2Current
    && summary.v3.prerequisites.performerRecordActive
    && summary.v3.prerequisites.livenessCurrent
    && summary.v3.prerequisites.payoutOwnershipVerified
    && consentAcknowledged;
  const canStartV2 = !summary.v2.current && !["pending", "needs_review"].includes(v2Status);
  const canStartV3 = v3Eligible && !summary.v3.current && !["pending", "needs_review"].includes(v3Status);
  const synthetic = provider.mode === "synthetic";

  return (
    <div className="verification-stack">
      <section className="ui-card verification-provider-card">
        <div>
          <span className="eyebrow">Provider boundary</span>
          <h2>{provider.label}</h2>
          <p className="muted-copy">
            {synthetic
              ? "This development-only workflow proves application behavior. It is not production identity verification and never self-promotes an account."
              : provider.mode === "provider"
                ? "A production provider is configured. LUX still requires an implemented approved adapter before a session can start."
                : "Production verification fails closed until an approved provider is configured."}
          </p>
        </div>
        <Badge tone={synthetic ? "warning" : provider.mode === "provider" ? "success" : "danger"}>
          {synthetic ? "Synthetic" : provider.mode === "provider" ? "Provider" : "Unavailable"}
        </Badge>
      </section>

      <section className="verification-level-grid" aria-label="Verification levels">
        <article className="ui-card verification-level-card">
          <div className="verification-level-card__topline">
            <div>
              <span className="eyebrow">V1</span>
              <h2>Adult viewer assurance</h2>
            </div>
            <Status label={summary.v1Current ? "Current" : "Not current"} tone={summary.v1Current ? "success" : "danger"} />
          </div>
          <p className="muted-copy">V1 controls adult access only. It does not prove creator identity or depicted-performer eligibility.</p>
        </article>

        <article className="ui-card verification-level-card">
          <div className="verification-level-card__topline">
            <div>
              <span className="eyebrow">V2</span>
              <h2>Identity verification</h2>
            </div>
            <Status label={STATUS_LABELS[v2Status]} tone={statusTone(v2Status)} />
          </div>
          <p className="verification-status-line" data-testid="verification-v2-status">{STATUS_LABELS[v2Status]}</p>
          <p className="muted-copy">V2 is server/reviewer-owned. Starting a session only creates a pending verification request.</p>
          {formatExpiry(summary.v2.expiresAt) ? <p className="verification-meta">Expires: {formatExpiry(summary.v2.expiresAt)}</p> : null}
          {summary.v2.recheckReason ? <p className="verification-meta">Recheck required: {summary.v2.recheckReason}</p> : null}
          {canStartV2 ? (
            <form action={v2Action} className="verification-action-form">
              <input type="hidden" name="level" value="v2" />
              <Button type="submit" loading={v2Pending} disabled={provider.mode !== "synthetic"}>
                {synthetic ? "Start development V2" : "Start V2 verification"}
              </Button>
              <ActionMessage state={v2ActionState} />
            </form>
          ) : (
            <p className="verification-meta">A new V2 session is unavailable while this state is current or under review.</p>
          )}
        </article>

        <article className="ui-card verification-level-card verification-level-card--wide">
          <div className="verification-level-card__topline">
            <div>
              <span className="eyebrow">V3</span>
              <h2>Depicted-performer verification</h2>
            </div>
            <Status label={STATUS_LABELS[v3Status]} tone={statusTone(v3Status)} />
          </div>
          <p className="verification-status-line" data-testid="verification-v3-status">{STATUS_LABELS[v3Status]}</p>
          <p className="muted-copy">V3 requires current V2 plus performer, liveness, payout-ownership and consent-education prerequisites. Each depicted person must satisfy these personally.</p>
          <ul className="verification-prerequisites">
            <Prerequisite met={summary.v3.prerequisites.v2Current}>Current V2 identity verification</Prerequisite>
            <Prerequisite met={summary.v3.prerequisites.performerRecordActive}>Active performer record</Prerequisite>
            <Prerequisite met={summary.v3.prerequisites.livenessCurrent}>Current performer liveness review</Prerequisite>
            <Prerequisite met={summary.v3.prerequisites.payoutOwnershipVerified}>Payout ownership verified</Prerequisite>
            <Prerequisite met={consentAcknowledged}>Consent education acknowledged</Prerequisite>
          </ul>
          <p className="verification-meta" data-testid="verification-consent-status">
            {consentAcknowledged ? "Acknowledged" : "Not acknowledged"}
          </p>
          {summary.v3.prerequisites.consentEducationVersion ? (
            <p className="verification-meta">Consent education version: {summary.v3.prerequisites.consentEducationVersion}</p>
          ) : null}
          {!consentAcknowledged && summary.v3.prerequisites.consentEducationVersion ? (
            <form action={consentAction} className="verification-action-form">
              <input type="hidden" name="policy_version" value={summary.v3.prerequisites.consentEducationVersion} />
              <Button type="submit" loading={consentPending} variant="secondary">
                Acknowledge consent education
              </Button>
              <ActionMessage state={consentState} />
            </form>
          ) : null}
          {formatExpiry(summary.v3.expiresAt) ? <p className="verification-meta">Expires: {formatExpiry(summary.v3.expiresAt)}</p> : null}
          {summary.v3.recheckReason ? <p className="verification-meta">Recheck required: {summary.v3.recheckReason}</p> : null}
          {canStartV3 ? (
            <form action={v3Action} className="verification-action-form">
              <input type="hidden" name="level" value="v3" />
              <Button type="submit" loading={v3Pending} disabled={provider.mode !== "synthetic"}>
                {synthetic ? "Start development V3" : "Start V3 verification"}
              </Button>
              <ActionMessage state={v3ActionState} />
            </form>
          ) : (
            <p className="verification-meta">Complete every V3 prerequisite before a depicted-performer verification session can begin.</p>
          )}
        </article>
      </section>

      <section className="ui-card verification-privacy-card">
        <span className="eyebrow">Private evidence boundary</span>
        <h2>Public profiles receive badges, not identity evidence</h2>
        <p className="muted-copy">Legal identity, provider references, raw evidence, reviewer identifiers and verification session IDs remain private. Public projections may expose only a current safe verification badge.</p>
      </section>
    </div>
  );
}
