import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { setSavedItemAction } from "@/app/app/saved/actions";
import { startDirectMessageAction } from "@/app/messages/actions";
import { ProfileSocialActions } from "@/components/profile/profile-social-actions";
import type { ProfileLink, ProfileVisibility } from "@/lib/profile/policy";
import type { PublicProfileRelease } from "@/lib/releases/policy";
import type { CreatorCommerceView } from "@/lib/creator/commerce";

export type PublicProfileView = {
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  links: ProfileLink[];
  languageCode: string;
  visibility: ProfileVisibility;
  followerCount: number;
  followingCount: number;
  creatorCapable: boolean;
  following: boolean;
  blockedByMe: boolean;
  mutedByMe: boolean;
};

export function PublicProfile({
  profile,
  signedIn,
  isOwner,
  verificationLevel,
  releases,
  commerce,
}: {
  profile: PublicProfileView;
  signedIn: boolean;
  isOwner: boolean;
  verificationLevel: "v2" | "v3" | null;
  releases: PublicProfileRelease[];
  commerce: CreatorCommerceView | null;
}) {
  return (
    <main className="public-profile-shell">
      <section className="public-profile-hero" aria-labelledby="public-profile-title">
        {profile.bannerUrl ? (
          <div className="public-profile-banner" style={{ backgroundImage: `url(${profile.bannerUrl})` }} aria-label="Profile banner" />
        ) : (
          <div className="public-profile-banner public-profile-banner--empty" aria-hidden="true" />
        )}
        <div className="public-profile-hero__body">
          <div className="public-profile-avatar" aria-label={`${profile.displayName} avatar`}>
            {profile.avatarUrl ? <span style={{ backgroundImage: `url(${profile.avatarUrl})` }} /> : <strong>{profile.displayName.slice(0, 2).toUpperCase()}</strong>}
          </div>
          <div className="public-profile-identity">
            <div className="public-profile-name-row">
              <div>
                <span className="eyebrow">@{profile.handle}</span>
                <h1 id="public-profile-title">{profile.displayName}</h1>
              </div>
              <div className="public-profile-badges">
                <Badge tone={profile.visibility === "public" ? "success" : profile.visibility === "unlisted" ? "info" : "neutral"}>{profile.visibility}</Badge>
                {verificationLevel ? (
                  <span data-testid="public-verification-badge">
                    <Badge tone="success">{verificationLevel.toUpperCase()} verified</Badge>
                  </span>
                ) : null}
                {profile.creatorCapable ? <Badge tone="accent">Creator workspace approved</Badge> : null}
              </div>
            </div>
            {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : <p className="muted-copy">No public bio yet.</p>}
            <div className="public-profile-meta">
              <span>{profile.languageCode}</span>
              <span>{profile.followerCount} followers</span>
              <span>{profile.followingCount} following</span>
            </div>
          </div>
        </div>
      </section>

      <div className="public-profile-grid">
        <Card className="public-profile-card">
          <span className="eyebrow">Links</span>
          <h2>Public links</h2>
          {profile.links.length ? (
            <ul className="public-profile-links">
              {profile.links.map((link) => (
                <li key={`${link.label}-${link.url}`}>
                  <a href={link.url} target="_blank" rel="noreferrer noopener">{link.label}</a>
                </li>
              ))}
            </ul>
          ) : <p className="muted-copy">No public links.</p>}
        </Card>

        <Card className="public-profile-card">
          {isOwner ? (
            <>
              <span className="eyebrow">Owner view</span>
              <h2>Your profile</h2>
              <p className="muted-copy">This is the same allowlisted projection other permitted viewers receive. Private account data is never rendered here.</p>
              <Link className="workspace-inline-link" href="/settings/profile">Edit profile</Link>
            </>
          ) : signedIn ? (
            <>
              <span className="eyebrow">Relationship</span>
              <h2>Control your connection</h2>
              <ProfileSocialActions
                handle={profile.handle}
                initial={{
                  following: profile.following,
                  blockedByMe: profile.blockedByMe,
                  mutedByMe: profile.mutedByMe,
                  followerCount: profile.followerCount,
                  followingCount: profile.followingCount,
                }}
              />
              {!profile.blockedByMe ? (
                <div className="workspace-inline-form">
                  <form action={startDirectMessageAction}>
                    <input type="hidden" name="handle" value={profile.handle} />
                    <Button type="submit" size="small">Message</Button>
                  </form>
                  <form action={setSavedItemAction}>
                    <input type="hidden" name="item_type" value="profile" />
                    <input type="hidden" name="item_public_id" value={profile.handle} />
                    <input type="hidden" name="saved" value="true" />
                    <input type="hidden" name="return_to" value={`/u/${profile.handle}`} />
                    <Button type="submit" size="small" variant="secondary">Save</Button>
                  </form>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <span className="eyebrow">Adult account required</span>
              <h2>Sign in to interact</h2>
              <p className="muted-copy">Viewing an available public profile does not require an account. Following, blocking, and muting require an authenticated adult-assured account.</p>
              <Link className="workspace-inline-link" href={`/auth/login?next=${encodeURIComponent(`/u/${profile.handle}`)}`}>Sign in</Link>
            </>
          )}
        </Card>
      </div>

      {commerce && (commerce.availability || commerce.offers.length) ? (
        <Card className="public-profile-card">
          <span className="eyebrow">Availability and offers</span>
          <h2>Voluntary project availability</h2>
          {commerce.availability ? (
            <p className="muted-copy">
              Status: {commerce.availability.status.replaceAll("_", " ")}
              {commerce.availability.nextAvailableAt ? ` · next ${new Date(commerce.availability.nextAvailableAt).toLocaleDateString()}` : ""}
              {commerce.availability.note ? ` · ${commerce.availability.note}` : ""}
            </p>
          ) : <p className="muted-copy">No public availability status.</p>}
          {commerce.offers.length ? (
            <div className="studio-stack">
              {commerce.offers.map((offer) => (
                <article key={offer.publicId}>
                  <h3>{offer.title}</h3>
                  <p className="muted-copy">{offer.description}</p>
                  <div className="studio-meta">
                    <span>{offer.roleName}</span>
                    <span>{offer.category.replaceAll("_", " ")}</span>
                    <span>{offer.startingMinor === null ? "Terms negotiated" : `${offer.startingMinor} ${offer.currency}`}</span>
                  </div>
                  {signedIn && !isOwner ? <Link className="workspace-inline-link" href={`/messages?with=${encodeURIComponent(profile.handle)}`}>Discuss this offer</Link> : null}
                </article>
              ))}
            </div>
          ) : null}
          <p className="muted-copy">Availability and offers are invitations to discuss only; they are not consent, bookings, or contracts.</p>
        </Card>
      ) : null}

      <Card className="public-profile-card">
        <span className="eyebrow">Released work</span>
        <h2>Approved releases</h2>
        {releases.length ? (
          <div className="studio-stack">
            {releases.map((release) => (
              <article key={release.publicId}>
                <h3>{release.title}</h3>
                <p className="muted-copy">{release.synopsis}</p>
                <div className="studio-meta">
                  <span>Approved delivery v{release.deliveryVersion}</span>
                  <span>SHA-256 {release.deliverySha256.slice(0, 12)}…</span>
                </div>
                <Link className="workspace-inline-link" href={`/releases/${release.publicId}`}>View release</Link>
              </article>
            ))}
          </div>
        ) : <p className="muted-copy">No approved releases are visible for this profile.</p>}
      </Card>
    </main>
  );
}
