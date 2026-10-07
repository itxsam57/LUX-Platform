import Link from "next/link";
import { setHiddenMarketplaceItemAction } from "@/app/app/discovery-preferences/actions";
import { Button } from "@/components/ui/primitives";
import type { MarketplaceDiscoveryItem } from "@/lib/discovery/marketplace";

export function MarketplaceDiscoveryGrid({
  items,
  returnTo,
}: {
  items: MarketplaceDiscoveryItem[];
  returnTo: string;
}) {
  return (
    <section className="discovery-grid" aria-label="Marketplace discovery results">
      {items.map((item) => (
        <article className="ui-card" key={`${item.type}:${item.publicId}`}>
          <span className="eyebrow">{item.type}</span>
          <h2>{item.title}</h2>
          <p className="muted-copy">{item.subtitle || "No public description."}</p>
          <div className="studio-meta">
            {item.type === "demand" && typeof item.meta.supportCount === "number" ? <span>{item.meta.supportCount} supporters</span> : null}
            {typeof item.meta.category === "string" ? <span>{item.meta.category.replaceAll("_"," ")}</span> : null}
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="workspace-inline-form">
            <Link className="workspace-inline-link" href={item.path}>Open {item.type}</Link>
            <form action={setHiddenMarketplaceItemAction}>
              <input type="hidden" name="item_type" value={item.type}/>
              <input type="hidden" name="item_public_id" value={item.publicId}/>
              <input type="hidden" name="hidden" value="true"/>
              <input type="hidden" name="return_to" value={returnTo}/>
              <Button type="submit" size="small" variant="secondary">Hide</Button>
            </form>
            <Link
              className="workspace-inline-link"
              href={`/app/support?report_type=${item.type}&report_subject=${encodeURIComponent(item.publicId)}#report-heading`}
            >
              Report
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
