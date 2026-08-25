import { VerificationPanel, type VerificationSummaryView } from "@/components/verification/verification-panel";
import { ErrorState, Status } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { getVerificationProviderRuntime } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSyntheticVerificationAdapter } from "@/lib/verification/synthetic-adapter";
import type { VerificationStatus } from "@/lib/verification/types";

export const dynamic = "force-dynamic";

const VERIFICATION_STATUSES = new Set<VerificationStatus>([
  "not_started",
  "pending",
  "needs_review",
  "verified",
  "rejected",
  "expired",
  "revoked",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStatus(value: unknown): VerificationStatus {
  return typeof value === "string" && VERIFICATION_STATUSES.has(value as VerificationStatus)
    ? value as VerificationStatus
    : "not_started";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSummary(value: unknown): VerificationSummaryView {
  const root = asRecord(value);
  const v1 = asRecord(root.v1);
  const v2 = asRecord(root.v2);
  const v3 = asRecord(root.v3);
  const prerequisites = asRecord(v3.prerequisites);

  return {
    v1Current: v1.current === true,
    v2: {
      status: asStatus(v2.status),
      current: v2.current === true,
      expiresAt: asNullableString(v2.expiresAt),
      recheckReason: asNullableString(v2.recheckReason),
    },
    v3: {
      status: asStatus(v3.status),
      current: v3.current === true,
      expiresAt: asNullableString(v3.expiresAt),
      recheckReason: asNullableString(v3.recheckReason),
      prerequisites: {
        v2Current: prerequisites.v2Current === true,
        performerRecordActive: prerequisites.performerRecordActive === true,
        livenessCurrent: prerequisites.livenessCurrent === true,
        payoutOwnershipVerified: prerequisites.payoutOwnershipVerified === true,
        consentEducationAcknowledged: prerequisites.consentEducationAcknowledged === true,
        consentEducationVersion: asNullableString(prerequisites.consentEducationVersion),
      },
    },
  };
}

export default async function VerificationSettingsPage() {
  const viewer = await requireAdultViewer("/settings/verification");
  const supabase = await createServerSupabaseClient();
  const runtime = getVerificationProviderRuntime();
  const { data, error } = await supabase.rpc("get_my_verification_summary");

  const providerLabel = runtime.mode === "synthetic"
    ? createSyntheticVerificationAdapter().providerLabel
    : runtime.mode === "provider"
      ? `Configured identity provider: ${runtime.providerKey ?? "approved provider"}`
      : "Production identity provider unavailable";

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack verification-page">
        <header className="workspace-page-header verification-page__header">
          <div>
            <span className="eyebrow">Creator and performer safety</span>
            <h1>Identity and performer verification</h1>
            <p>V2 proves an account identity. V3 adds depicted-performer requirements. Viewer age assurance remains a separate V1 boundary.</p>
          </div>
          <Status
            label={runtime.mode === "synthetic" ? "Development test mode" : runtime.mode === "provider" ? "Provider configured" : "Provider required"}
            tone={runtime.mode === "synthetic" ? "warning" : runtime.mode === "provider" ? "success" : "danger"}
          />
        </header>

        {error ? (
          <ErrorState
            title="Verification state is unavailable"
            description="LUX could not load the private verification summary. No verification status has been assumed."
          />
        ) : (
          <VerificationPanel
            summary={parseSummary(data)}
            provider={{
              mode: runtime.mode,
              label: providerLabel,
            }}
          />
        )}
      </div>
    </WorkspaceShell>
  );
}
