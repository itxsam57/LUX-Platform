import { createOfferAction, saveAvailabilityAction, setOfferStateAction } from "./actions";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Input, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseCreatorCommerce } from "@/lib/creator/commerce";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function time(value?: string | null) {
  return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Not set";
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdultViewer("/app/offers");
  if (viewer.context.activeRole !== "creator" && viewer.context.activeRole !== "performer") {
    return (
      <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
        <div className="ui-state-card ui-state-card--error"><h1>Creator or performer workspace required</h1><p>Activate an approved creator or performer workspace to manage availability and offers.</p></div>
      </WorkspaceShell>
    );
  }

  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_creator_commerce");
  const commerce = error ? null : parseCreatorCommerce(data);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Voluntary availability</span>
            <h1>Availability and offers</h1>
            <p>Publishing availability or an offer never creates consent, a booking, or a contract. Every project still requires explicit negotiation and exact terms.</p>
          </div>
          <Status label={commerce ? `${commerce.offers.length} offers` : "Unavailable"} tone={commerce ? "success" : "danger"} />
        </header>

        {first(params.notice) ? <div className="auth-message auth-message--success" role="status">Update saved.</div> : null}
        {first(params.error) || error || !commerce ? <div className="auth-message auth-message--error" role="alert">The availability/offer action could not be completed safely.</div> : null}

        <section className="workspace-request-panel" aria-labelledby="availability-heading">
          <div>
            <span className="eyebrow">{viewer.context.activeRole}</span>
            <h2 id="availability-heading">Availability</h2>
            <p>Public availability is intentionally coarse. Private scheduling details belong in project negotiation.</p>
          </div>
          <form action={saveAvailabilityAction} className="workspace-form-grid">
            <Select id="availability-status" name="status" label="Status" defaultValue={commerce?.availability?.status ?? "unavailable"}>
              <option value="available">Available</option>
              <option value="limited">Limited</option>
              <option value="unavailable">Unavailable</option>
            </Select>
            <Input id="availability-next" name="next_available_at" label="Next available" type="datetime-local" />
            <Textarea id="availability-note" name="note" label="Public note" defaultValue={commerce?.availability?.note ?? ""} maxLength={500} rows={3} />
            <Button type="submit">Save availability</Button>
          </form>
          {commerce?.availability ? <p className="muted-copy">Current: {commerce.availability.status}. Next: {time(commerce.availability.nextAvailableAt)}.</p> : null}
        </section>

        <section className="workspace-request-panel" aria-labelledby="offer-heading">
          <div><span className="eyebrow">Optional public listing</span><h2 id="offer-heading">Create offer</h2><p>Describe a service or participation offer. The starting price is informational and not a charge authorization.</p></div>
          <form action={createOfferAction} className="workspace-form-grid">
            <Input id="offer-title" name="title" label="Title" minLength={3} maxLength={120} required />
            <Textarea id="offer-description" name="description" label="Description" minLength={20} maxLength={2000} rows={5} required />
            <Input id="offer-category" name="category" label="Category" placeholder="performance" required />
            <Input id="offer-role" name="role_name" label="Role" placeholder={viewer.context.activeRole === "performer" ? "performer" : "creator"} required />
            <Input id="offer-price" name="starting_minor" label="Starting price (minor units)" type="number" min={0} step={1} />
            <Input id="offer-currency" name="currency" label="Currency" placeholder="USD" minLength={3} maxLength={3} />
            <Button type="submit">Publish offer</Button>
          </form>
        </section>

        {commerce?.offers.length ? (
          <Table caption="Your creator and performer offers">
            <thead><tr><th scope="col">Offer</th><th scope="col">Role</th><th scope="col">State</th><th scope="col">Price</th><th scope="col">Action</th></tr></thead>
            <tbody>{commerce.offers.map((offer) => (
              <tr key={offer.publicId}>
                <td><strong>{offer.title}</strong><br/><small>{offer.description}</small></td>
                <td>{offer.roleName}</td>
                <td>{offer.state ?? "active"}</td>
                <td>{offer.startingMinor === null ? "Negotiated" : `${offer.startingMinor} ${offer.currency}`}</td>
                <td>
                  <form action={setOfferStateAction} className="workspace-inline-form">
                    <input type="hidden" name="offer_public_id" value={offer.publicId} />
                    <Select id={`offer-state-${offer.publicId}`} name="state" label="State" defaultValue={offer.state ?? "active"}>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </Select>
                    <Button type="submit" size="small" variant="secondary">Save</Button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        ) : commerce ? <div className="ui-state-card"><h2>No offers yet</h2><p>Create an optional public offer when you want to invite project conversations.</p></div> : null}
      </div>
    </WorkspaceShell>
  );
}
