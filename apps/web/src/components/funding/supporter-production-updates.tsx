import type { ProductionUpdateKind } from "@/lib/production/policy";

export function SupporterProductionUpdates({ updates }: { updates: Array<{ publicId: string; body: string; kind: ProductionUpdateKind; revisedEstimate: string | null; publishedAt: string }> }) {
  return <section className="studio-card"><h2>Production updates</h2>{updates.length===0?<p>No approved production updates have been published to your supporter record yet.</p>:<div className="studio-stack">{updates.map((update)=><article key={update.publicId}><div className="studio-meta"><span>{update.kind}</span><span>{new Intl.DateTimeFormat("en",{dateStyle:"medium"}).format(new Date(update.publishedAt))}</span></div><p>{update.body}</p>{update.revisedEstimate?<p><strong>Revised estimate:</strong> {new Intl.DateTimeFormat("en",{dateStyle:"medium"}).format(new Date(update.revisedEstimate))}</p>:null}</article>)}</div>}</section>;
}
