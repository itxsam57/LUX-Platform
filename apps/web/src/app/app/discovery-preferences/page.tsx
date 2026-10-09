import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Input, Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseDiscoveryPreferences } from "@/lib/discovery/preferences";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { setDiscoveryInterestAction, setHiddenMarketplaceItemAction, setHiddenTopicAction } from "./actions";

export const dynamic="force-dynamic";

export default async function DiscoveryPreferencesPage() {
  const viewer=await requireAdultViewer("/app/discovery-preferences");
  const supabase=await createServerSupabaseClient();
  const { data,error }=await supabase.rpc("get_discovery_preferences");
  const preferences=error?null:parseDiscoveryPreferences(data);

  return <WorkspaceShell email={viewer.user.email??"Verified account"} context={viewer.context}>
    <div className="workspace-stack">
      <header className="workspace-page-header">
        <div><span className="eyebrow">Transparent ranking controls</span><h1>Discovery preferences</h1><p>Interests boost matching public creator signals. Hidden topics and exact hidden items are removed before ranking.</p></div>
        <Status label={preferences?"Preferences ready":"Unavailable"} tone={preferences?"success":"danger"}/>
      </header>

      {!preferences?<div className="auth-message auth-message--error" role="alert">Discovery preferences could not be loaded safely.</div>:null}

      {preferences ? <section className="workspace-request-panel" aria-labelledby="interests-heading">
        <div><span className="eyebrow">Interests</span><h2 id="interests-heading">Ranking interests</h2><p>The taxonomy is derived from live marketplace categories rather than hidden inferred traits.</p></div>
        <div className="workspace-stack">
          {preferences.interests.length ? preferences.interests.map((interest)=><form action={setDiscoveryInterestAction} className="workspace-inline-form" key={interest.slug}>
            <input type="hidden" name="slug" value={interest.slug}/>
            <input type="hidden" name="enabled" value={interest.enabled?"false":"true"}/>
            <span>{interest.label}</span>
            <Button type="submit" size="small" variant={interest.enabled?"secondary":"primary"}>{interest.enabled?"Remove":"Add"}</Button>
          </form>):<p className="muted-copy">Interest categories appear as public marketplace categories are created.</p>}
        </div>
      </section>:null}

      {preferences ? <section className="workspace-request-panel" aria-labelledby="topics-heading">
        <div><span className="eyebrow">Topic hiding</span><h2 id="topics-heading">Hidden topics</h2><p>Use the exact category slug shown in marketplace content. Matching creator signals are excluded from the profile feed.</p></div>
        <form action={setHiddenTopicAction} className="workspace-inline-form">
          <Input id="hide-topic" name="slug" label="Topic slug" placeholder="performance" required/>
          <input type="hidden" name="hidden" value="true"/>
          <Button type="submit" variant="secondary">Hide topic</Button>
        </form>
        {preferences.hiddenTopics.map((slug)=><form action={setHiddenTopicAction} className="workspace-inline-form" key={slug}>
          <input type="hidden" name="slug" value={slug}/><input type="hidden" name="hidden" value="false"/>
          <span>{slug}</span><Button type="submit" size="small" variant="secondary">Unhide</Button>
        </form>)}
      </section>:null}

      {preferences?.hiddenItems.length ? <Table caption="Exact hidden marketplace items">
        <thead><tr><th scope="col">Type</th><th scope="col">Public ID</th><th scope="col">Hidden</th><th scope="col">Action</th></tr></thead>
        <tbody>{preferences.hiddenItems.map((item)=><tr key={`${item.type}:${item.publicId}`}>
          <td>{item.type}</td><td>{item.publicId}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td>
          <td><form action={setHiddenMarketplaceItemAction}><input type="hidden" name="item_type" value={item.type}/><input type="hidden" name="item_public_id" value={item.publicId}/><input type="hidden" name="hidden" value="false"/><input type="hidden" name="return_to" value="/app/discovery-preferences"/><Button type="submit" size="small" variant="secondary">Unhide</Button></form></td>
        </tr>)}</tbody>
      </Table>:preferences?<div className="ui-state-card"><h2>No exact hidden items</h2><p>Items hidden from Feed, Explore, or Search will appear here.</p></div>:null}
    </div>
  </WorkspaceShell>;
}
