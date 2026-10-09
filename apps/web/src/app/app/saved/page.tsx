import Link from "next/link";
import { setSavedItemAction } from "./actions";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseSavedItems } from "@/lib/consumer/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

export default async function SavedItemsPage() {
  const viewer = await requireAdultViewer("/app/saved");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_saved_items");
  const items = error ? [] : parseSavedItems(data);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Private saved list</span>
            <h1>Saved</h1>
            <p>Profiles, demands, campaigns, and releases you save are private to your account and filtered again at read time.</p>
          </div>
          <Status label={error ? "Unavailable" : `${items.length} saved`} tone={error ? "danger" : "success"} />
        </header>
        {error ? <div className="auth-message auth-message--error" role="alert">Saved items could not be loaded safely.</div> : null}
        {items.length ? (
          <Table caption="Your saved items">
            <thead><tr><th scope="col">Type</th><th scope="col">Item</th><th scope="col">Saved</th><th scope="col">Open</th><th scope="col">Action</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={`${item.type}:${item.publicId}`}>
                <td>{item.type}</td>
                <td><strong>{item.title}</strong><br/><small>{item.subtitle || item.publicId}</small></td>
                <td>{formatTime(item.createdAt)}</td>
                <td><Link href={item.path}>Open</Link></td>
                <td>
                  <form action={setSavedItemAction}>
                    <input type="hidden" name="item_type" value={item.type} />
                    <input type="hidden" name="item_public_id" value={item.publicId} />
                    <input type="hidden" name="saved" value="false" />
                    <input type="hidden" name="return_to" value="/app/saved" />
                    <Button type="submit" size="small" variant="secondary">Remove</Button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        ) : !error ? <div className="ui-state-card"><h2>No saved items</h2><p>Use Save on profiles, demands, campaigns, or releases to keep a private list here.</p></div> : null}
      </div>
    </WorkspaceShell>
  );
}
