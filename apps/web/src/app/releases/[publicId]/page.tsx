import Link from "next/link";
import { notFound } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Card } from "@/components/ui/primitives";
import { getOptionalViewer } from "@/lib/auth/context";
import { parseReleaseDetail } from "@/lib/releases/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { issueReleaseAssetAction, issueReleasePlaybackAction, reportReleaseStolenCopyAction, submitReleaseReviewAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReleasePage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { publicId } = await params; if (!/^rel[0-9a-f]{24}$/.test(publicId)) notFound();
  const query = await searchParams, supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_release_detail", { requested_release_public_id: publicId });
  const release = error ? null : parseReleaseDetail(data); if (!release) notFound();
  let signedIn = false; try { signedIn = Boolean(await getOptionalViewer()); } catch { signedIn = false; }
  return <main className="public-profile-shell">
    <section className="public-profile-hero"><div className="public-profile-hero__body"><div className="public-profile-identity"><span className="eyebrow">Secure release · @{release.creatorHandle}</span><h1>{release.title}</h1><p className="public-profile-bio">{release.synopsis}</p><div className="public-profile-meta"><span>Approved delivery v{release.deliveryVersion}</span><span>SHA-256 {release.deliverySha256.slice(0,12)}…</span><span>{release.ratingCount ? `${release.ratingAverage ?? "—"}/5 from ${release.ratingCount}` : "No ratings yet"}</span></div></div></div></section>
    {query.notice ? <p className="studio-notice" role="status">Release updated.</p> : null}{query.error ? <p className="studio-error" role="alert">The requested release action could not be completed safely.</p> : null}
    <div className="public-profile-grid">
      <Card className="public-profile-card"><span className="eyebrow">Playback</span><h2>{release.playbackEligible ? "Ready to watch" : "Entitlement required"}</h2><p className="muted-copy">Playback uses a short-lived session and is rechecked against the current payment and final-delivery state on every request.</p>{release.playbackEligible ? <NavigationActionForm action={issueReleasePlaybackAction}><input type="hidden" name="release_public_id" value={release.publicId}/><button className="studio-button studio-button--primary" type="submit">Watch securely</button></NavigationActionForm> : signedIn ? <Link className="workspace-inline-link" href="/workspace/fan">Open fan library</Link> : <Link className="workspace-inline-link" href={`/auth/login?next=${encodeURIComponent(`/releases/${release.publicId}`)}`}>Sign in</Link>}</Card>
      <Card className="public-profile-card"><span className="eyebrow">Release assets</span><h2>Poster and preview</h2><p className="muted-copy">Available assets are served through short-lived access paths; permanent storage locations are never rendered.</p>{signedIn && release.posterAvailable ? <NavigationActionForm action={issueReleaseAssetAction}><input type="hidden" name="release_public_id" value={release.publicId}/><input type="hidden" name="kind" value="poster"/><button className="studio-button" type="submit">Open poster</button></NavigationActionForm> : null}{signedIn && release.previewAvailable ? <NavigationActionForm action={issueReleaseAssetAction}><input type="hidden" name="release_public_id" value={release.publicId}/><input type="hidden" name="kind" value="preview"/><button className="studio-button" type="submit">Open preview</button></NavigationActionForm> : null}{!signedIn ? <p className="muted-copy">Sign in to request protected release assets.</p> : null}</Card>
    </div>
    <div className="public-profile-grid">
      <Card className="public-profile-card"><span className="eyebrow">Rating</span><h2>Review this release</h2>{release.playbackEligible ? <NavigationActionForm action={submitReleaseReviewAction} className="studio-form studio-form--compact"><input type="hidden" name="release_public_id" value={release.publicId}/><label>Rating<select name="rating" defaultValue={release.myRating ?? 5}>{[5,4,3,2,1].map((rating)=><option key={rating} value={rating}>{rating}/5</option>)}</select></label><label>Review<textarea name="body" minLength={3} maxLength={2000} defaultValue={release.myReview ?? ""}/></label><button className="studio-button" type="submit">Save review</button></NavigationActionForm> : <p className="muted-copy">An active funded entitlement is required to rate or review this release.</p>}</Card>
      <Card className="public-profile-card"><span className="eyebrow">Copyright support</span><h2>Report a copied release</h2>{signedIn ? <NavigationActionForm action={reportReleaseStolenCopyAction} className="studio-form studio-form--compact"><input type="hidden" name="release_public_id" value={release.publicId}/><label>Copy URL<input name="url" type="url" required maxLength={2048}/></label><label>What did you find?<textarea name="note" required minLength={3} maxLength={2000}/></label><button className="studio-button" type="submit">Report copied release</button></NavigationActionForm> : <p className="muted-copy">Sign in to submit a private copied-release report.</p>}</Card>
    </div>
    <Link className="workspace-inline-link" href={`/u/${encodeURIComponent(release.creatorHandle)}`}>Back to creator profile</Link>
  </main>;
}
