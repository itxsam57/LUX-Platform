import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { ProfileSocialActions } from "@/components/profile/profile-social-actions";
import type { ProfileLink, ProfileVisibility } from "@/lib/profile/policy";

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
}: {
  profile: PublicProfileView;
  signedIn: boolean;
  isOwner: boolean;
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
    </main>
  );
}
