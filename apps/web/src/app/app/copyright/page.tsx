import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, Select, Status, Table } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseCopyrightCaseList, parseCreatorRightsRegistry } from "@/lib/copyright/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { registerReleaseRightsAction } from "./actions";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function CreatorCopyrightPage() {
  await requireWorkspace("creator", "creator-copyright");
  const supabase = await createServerSupabaseClient();
  const [registryResult, casesResult] = await Promise.all([
    supabase.rpc("list_creator_rights_registry"),
    supabase.rpc("list_creator_copyright_cases"),
  ]);
  const registry = parseCreatorRightsRegistry(registryResult.data);
  const cases = parseCopyrightCaseList(casesResult.data);
  const loadError = Boolean(registryResult.error || casesResult.error);

  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Rights protection</span><h1>Copyright and copied-content cases</h1><p>Register release ownership evidence, track watermark processing, and follow every case stage tied to your releases.</p></div><Status label={loadError ? "Unavailable" : `${cases.length} cases`} tone={loadError ? "danger" : cases.length ? "warning" : "success"}/></header>
    {loadError ? <div className="auth-message auth-message--error" role="alert">Copyright data could not be loaded safely.</div> : null}

    <section className="workspace-stack" aria-labelledby="rights-registry-heading">
      <div className="workspace-page-header"><div><span className="eyebrow">Rights registry</span><h2 id="rights-registry-heading">Released work</h2><p>Registration stores an immutable ownership record and queues watermark processing. Fingerprints identify the released file; they do not reveal purchasers.</p></div></div>
      {registry.length ? registry.map((row) => <article className="workspace-request-panel" key={row.releasePublicId}><div><h3>{row.releaseTitle}</h3><p>{row.releasePublicId} · released {formatTime(row.releasedAt)}</p>{row.rightsPublicId ? <p>Registered as {row.ownershipKind} · watermark {row.watermarkState ?? "pending"}</p> : <p>No rights registration yet.</p>}</div>{row.rightsPublicId ? <Status label="Registered" tone="success"/> : <NavigationActionForm action={registerReleaseRightsAction} className="workspace-form-grid">
        <input type="hidden" name="release_public_id" value={row.releasePublicId}/>
        <Select id={`ownership-${row.releasePublicId}`} name="ownership_kind" label="Rights basis" required><option value="owner">Owner</option><option value="licensee">Licensee</option></Select>
        <Input id={`licence-${row.releasePublicId}`} name="licence_reference" label="Licence reference (if licensed)" maxLength={180}/>
        <Input id={`evidence-${row.releasePublicId}`} name="ownership_evidence_reference" label="Evidence reference" placeholder="evidence:creator-contract-0042" required/>
        <Input id={`sha-${row.releasePublicId}`} name="content_sha256" label="Release SHA-256" minLength={64} maxLength={64} required/>
        <Input id={`fingerprint-${row.releasePublicId}`} name="perceptual_fingerprint" label="Perceptual fingerprint" placeholder="phash:8f0a1134de89bc22" required/>
        <Button type="submit">Register rights</Button>
      </NavigationActionForm>}</article>) : !loadError ? <div className="ui-state-card"><h3>No released work yet</h3><p>Rights registration becomes available after a release is published.</p></div> : null}
    </section>

    <section className="workspace-stack" aria-labelledby="creator-cases-heading"><div className="workspace-page-header"><div><span className="eyebrow">Private case history</span><h2 id="creator-cases-heading">Copied-content cases</h2><p>You can see the current stage, reported location, notice state, removal confirmation, and recurrence history for every opened case on your releases.</p></div></div>{cases.length ? <Table caption="Copyright cases for your releases"><thead><tr><th scope="col">Release</th><th scope="col">Reported location</th><th scope="col">Stage</th><th scope="col">Notice</th><th scope="col">Recurrence</th><th scope="col">Updated</th></tr></thead><tbody>{cases.map((row) => <tr key={row.publicId}><td>{row.releaseTitle}</td><td>{row.reportedUrl}</td><td>{row.stage.replaceAll("_", " ")}</td><td>{row.noticeStatus.replaceAll("_", " ")}</td><td>{row.recurrenceCount}</td><td>{formatTime(row.updatedAt)}</td></tr>)}</tbody></Table> : !loadError ? <div className="ui-state-card"><h3>No opened cases</h3><p>When a copied-release report becomes a copyright case, its full stage history will appear here.</p></div> : null}</section>
  </div>;
}
