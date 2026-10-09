import Link from "next/link";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import type { ProductionWorkspaceRecord } from "@/lib/production/policy";
import type { DeliveryReviewContext } from "@/lib/review/policy";
import {
  issueFinalDeliveryAssetAccessAction,
  respondToDeliveryReviewAction,
  submitFinalDeliveryAction,
} from "@/app/studio/projects/[publicId]/production/actions";

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pending";
}

export function DeliveryReviewPanel({
  projectPublicId,
  review,
  assets,
  isOwner,
  idempotencyKey,
}: {
  projectPublicId: string;
  review: DeliveryReviewContext;
  assets: ProductionWorkspaceRecord["assets"];
  isOwner: boolean;
  idempotencyKey: string;
}) {
  const mediaAssets = assets.filter((asset) => asset.kind === "media");
  const current = review.current;

  return (
    <section className="studio-card">
      <div className="studio-card__header">
        <div>
          <span className="eyebrow">Canonical delivery review</span>
          <h2>Final delivery and platform review</h2>
        </div>
        <span>{current ? current.status.replaceAll("_", " ") : "Not submitted"}</span>
      </div>

      <p>The current final is immutable by version and hash. A changed file creates a new version and requires fresh final-cut approval.</p>

      {review.contract ? (
        <div className="studio-stack">
          <div className="studio-meta">
            <span>Contract v{review.contract.version}</span>
            <span>Terms {review.contract.termsHash.slice(0, 12)}…</span>
          </div>
          {review.contract.participants.filter((participant) => participant.depicted).map((participant) => (
            <div className="studio-meta" key={participant.handle}>
              <strong>@{participant.handle}</strong>
              <span>{participant.accepted ? "terms accepted" : "terms pending"}</span>
              <span>{participant.consentRecorded ? "consent recorded" : "consent pending"}</span>
            </div>
          ))}
        </div>
      ) : <p>The contract must be locked before a final delivery can be submitted.</p>}

      {current ? (
        <div className="studio-stack">
          <article>
            <strong>Version {current.version}</strong>
            <div className="studio-meta">
              <span>SHA-256 {current.sha256.slice(0, 16)}…</span>
              <span>Processing {current.processingState}</span>
              <span>{current.releaseReady ? "Release ready" : "Blocked from release"}</span>
              <span>Submitted {when(current.submittedAt)}</span>
            </div>
            {current.processingNote ? <p>{current.processingNote}</p> : null}
            <NavigationActionForm action={issueFinalDeliveryAssetAccessAction}>
              <input type="hidden" name="project_public_id" value={projectPublicId} />
              <input type="hidden" name="delivery_public_id" value={current.publicId} />
              <button className="studio-button" type="submit">Open current final securely</button>
            </NavigationActionForm>
          </article>

          <article>
            <h3>Final-cut approvals</h3>
            {current.finalCutApprovals.length ? current.finalCutApprovals.map((approval) => (
              <div className="studio-meta" key={approval.handle}>
                <strong>@{approval.handle}</strong>
                <span>{approval.state.replaceAll("_", " ")}</span>
                <span>{when(approval.respondedAt)}</span>
              </div>
            )) : <p>No depicted-person final-cut approval is required for this version.</p>}
            {current.finalCutApprovals.length ? <Link className="studio-button" href={`/final-cut/${current.publicId}`}>Open personal final-cut page</Link> : null}
          </article>

          <article>
            <h3>Platform checklist</h3>
            {current.checklist.map((item) => (
              <div className="studio-meta" key={item.key}>
                <strong>{item.label}</strong>
                <span>{item.state}</span>
                {item.note ? <span>{item.note}</span> : null}
              </div>
            ))}
          </article>

          {isOwner ? (
            <NavigationActionForm action={respondToDeliveryReviewAction} className="studio-form studio-form--compact">
              <input type="hidden" name="project_public_id" value={projectPublicId} />
              <input type="hidden" name="delivery_public_id" value={current.publicId} />
              <label>Creator response<textarea name="body" minLength={3} maxLength={2000} required /></label>
              <button className="studio-button" type="submit">Record response</button>
            </NavigationActionForm>
          ) : null}
        </div>
      ) : null}

      {isOwner && review.contract && mediaAssets.length ? (
        <NavigationActionForm action={submitFinalDeliveryAction} className="studio-form studio-form--compact">
          <input type="hidden" name="project_public_id" value={projectPublicId} />
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <label>Final media asset<select name="asset_public_id" required defaultValue="">
            <option value="" disabled>Select an uploaded media asset</option>
            {mediaAssets.map((asset) => <option key={asset.publicId} value={asset.publicId}>{asset.publicId} · {asset.sha256.slice(0, 12)}…</option>)}
          </select></label>
          <button className="studio-button studio-button--primary" type="submit">Submit new final version</button>
        </NavigationActionForm>
      ) : null}

      {review.deliveries.length ? (
        <div className="studio-stack">
          <h3>Version history</h3>
          {review.deliveries.map((delivery) => (
            <div className="studio-meta" key={delivery.publicId}>
              <strong>v{delivery.version}</strong>
              <span>{delivery.status.replaceAll("_", " ")}</span>
              <span>{delivery.processingState}</span>
              <span>SHA {delivery.sha256.slice(0, 12)}…</span>
            </div>
          ))}
        </div>
      ) : null}

      {review.reviewHistory.length ? (
        <div className="studio-stack">
          <h3>Review decision history</h3>
          {review.reviewHistory.map((event, index) => (
            <article key={`${event.deliveryPublicId}-${event.createdAt}-${index}`}>
              <strong>v{event.version} · {event.decision.replaceAll("_", " ")}</strong>
              <p>{event.reason}</p>
              <div className="studio-meta"><span>{event.reviewerHandle ? `@${event.reviewerHandle}` : "Reviewer"}</span><span>{when(event.createdAt)}</span></div>
            </article>
          ))}
        </div>
      ) : null}

      {review.creatorResponses.length ? (
        <div className="studio-stack">
          <h3>Creator response history</h3>
          {review.creatorResponses.map((response, index) => (
            <article key={`${response.deliveryPublicId}-${response.createdAt}-${index}`}><strong>v{response.version}</strong><p>{response.body}</p><span>{when(response.createdAt)}</span></article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
