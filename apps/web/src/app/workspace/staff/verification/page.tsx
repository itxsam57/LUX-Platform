import { redirect } from "next/navigation";
import { Status, Table } from "@/components/ui/primitives";
import { WorkspaceMutationForm } from "@/components/workspace/workspace-mutation-form";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewVerificationAction } from "./actions";

export const dynamic = "force-dynamic";

type ReviewRow = {
  userId: string;
  handle: string;
  level: "v2" | "v3";
  status: "not_started" | "pending" | "needs_review" | "verified" | "rejected" | "expired" | "revoked";
  latestSessionId: string | null;
};

function parseReviewRow(value: unknown): ReviewRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.user_id !== "string"
    || typeof row.handle !== "string"
    || (row.level !== "v2" && row.level !== "v3")
    || !["not_started", "pending", "needs_review", "verified", "rejected", "expired", "revoked"].includes(String(row.status))
  ) return null;

  return {
    userId: row.user_id,
    handle: row.handle,
    level: row.level,
    status: row.status as ReviewRow["status"],
    latestSessionId: typeof row.latest_session_id === "string" ? row.latest_session_id : null,
  };
}

function levelLabel(level: ReviewRow["level"]) {
  return level.toUpperCase();
}

function statusLabel(status: ReviewRow["status"]) {
  return status.replaceAll("_", " ");
}

export default async function VerificationReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireWorkspace("staff", "staff-verification");
  const supabase = await createServerSupabaseClient();

  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "staff-verification",
      required_role: "reviewer",
      denial_reason: "verification_reviewer_required",
    });
    redirect("/access-denied?route=staff-verification");
  }

  const params = await searchParams;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const { data, error } = await supabase.rpc("get_verification_review_queue");
  const rows = Array.isArray(data)
    ? data.flatMap((value): ReviewRow[] => {
        const parsed = parseReviewRow(value);
        return parsed ? [parsed] : [];
      })
    : [];

  return (
    <div className="workspace-stack verification-review-page">
      <header className="workspace-page-header">
        <div>
          <span className="eyebrow">Reviewer-only identity boundary</span>
          <h1>Verification review queue</h1>
          <p>Review normalized V2/V3 state without exposing legal identity documents or provider evidence in the workspace.</p>
        </div>
        <Status label={`${rows.length} states`} tone={error ? "danger" : rows.length ? "warning" : "success"} />
      </header>

      {notice ? <div className="auth-message auth-message--success" role="status">Verification review completed.</div> : null}
      {error ? <div className="auth-message auth-message--error" role="alert">The verification queue could not be loaded safely.</div> : null}

      {rows.length ? (
        <Table caption="Identity and depicted-performer verification states">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Level</th>
              <th scope="col">Status</th>
              <th scope="col">Reviewer actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.userId}-${row.level}`}>
                <td>@{row.handle}</td>
                <td>{levelLabel(row.level)}</td>
                <td>{statusLabel(row.status)}</td>
                <td>
                  <div className="component-row">
                    {(row.status === "pending" || row.status === "needs_review") && row.latestSessionId ? (
                      <WorkspaceMutationForm
                        action={reviewVerificationAction}
                        fields={[
                          { name: "operation", value: "approve" },
                          { name: "level", value: row.level },
                          { name: "session_id", value: row.latestSessionId },
                        ]}
                        label={`Approve ${levelLabel(row.level)}`}
                        size="small"
                      />
                    ) : null}

                    {row.level === "v2" && row.status === "verified" ? (
                      <WorkspaceMutationForm
                        action={reviewVerificationAction}
                        fields={[
                          { name: "operation", value: "complete_performer" },
                          { name: "target_user_id", value: row.userId },
                        ]}
                        label="Complete performer prerequisites"
                        size="small"
                        variant="secondary"
                      />
                    ) : null}

                    {row.level === "v3" && row.status === "verified" ? (
                      <WorkspaceMutationForm
                        action={reviewVerificationAction}
                        fields={[
                          { name: "operation", value: "revoke" },
                          { name: "target_user_id", value: row.userId },
                          { name: "level", value: "v3" },
                        ]}
                        label="Revoke V3"
                        size="small"
                        variant="danger"
                      />
                    ) : null}

                    {row.level === "v2" && row.status === "verified" ? (
                      <WorkspaceMutationForm
                        action={reviewVerificationAction}
                        fields={[
                          { name: "operation", value: "expire" },
                          { name: "target_user_id", value: row.userId },
                          { name: "level", value: "v2" },
                        ]}
                        label="Expire V2"
                        size="small"
                        variant="danger"
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : !error ? (
        <div className="ui-state-card">
          <span className="ui-state-card__icon" aria-hidden="true">✓</span>
          <h2>No verification states yet</h2>
          <p>Pending and current V2/V3 states will appear here after an account starts a verification workflow.</p>
        </div>
      ) : null}
    </div>
  );
}
