import { PrivacySettings } from "@/components/profile/privacy-settings";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Status } from "@/components/ui/primitives";
import { requireAuthenticatedViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RelationshipItem = { handle: string; displayName: string };

function parseRelationshipList(value: unknown): RelationshipItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.handle !== "string" || typeof row.display_name !== "string") return [];
    return [{ handle: row.handle, displayName: row.display_name }];
  });
}

export default async function PrivacySettingsPage() {
  const viewer = await requireAuthenticatedViewer("/settings/privacy");
  const supabase = await createServerSupabaseClient();
  const [{ data: profile }, { data: requests }, { data: relationships }] = await Promise.all([
    supabase.from("profiles").select("supporter_anonymity_default").eq("user_id", viewer.user.id).single(),
    supabase.from("privacy_requests").select("status, requested_at").eq("user_id", viewer.user.id).eq("request_type", "deletion").order("requested_at", { ascending: false }).limit(1),
    supabase.rpc("get_private_profile_relationships"),
  ]);

  const relationshipObject = relationships && typeof relationships === "object" ? relationships as Record<string, unknown> : {};

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Privacy controls</span>
            <h1>Your account, your boundaries</h1>
            <p>Export, deletion, supporter anonymity, and removal of existing blocks or mutes are account rights and remain available without a current adult-assurance record.</p>
          </div>
          <Status label="Owner only" tone="success" />
        </header>
        <PrivacySettings
          anonymousByDefault={profile?.supporter_anonymity_default !== false}
          deletionStatus={requests?.[0]?.status ?? null}
          blocks={parseRelationshipList(relationshipObject.blocks)}
          mutes={parseRelationshipList(relationshipObject.mutes)}
        />
      </div>
    </WorkspaceShell>
  );
}
