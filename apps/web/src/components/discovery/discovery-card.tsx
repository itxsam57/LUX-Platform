import Link from "next/link";
import { Avatar, Badge, Card } from "@/components/ui/primitives";
import type { DiscoveryProfile } from "@/lib/discovery/projection";

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("") || "LX";
}

export function DiscoveryCard({ profile }: { profile: DiscoveryProfile }) {
  return (
    <Card as="article" className="discovery-card">
      <div className="discovery-card__identity">
        {profile.avatarUrl ? (
          <img className="discovery-card__avatar" src={profile.avatarUrl} alt="" width={56} height={56} />
        ) : (
          <Avatar initials={initials(profile.displayName)} label={`${profile.displayName} avatar`} size="large" />
        )}
        <div>
          <div className="discovery-card__title-row">
            <h2><Link href={`/u/${encodeURIComponent(profile.handle)}`}>{profile.displayName}</Link></h2>
            {profile.creatorCapable ? <Badge tone="accent">Creator</Badge> : null}
          </div>
          <p className="muted-copy">@{profile.handle} · {profile.followerCount.toLocaleString("en")} followers</p>
        </div>
      </div>
      {profile.bio ? <p className="discovery-card__bio">{profile.bio}</p> : <p className="muted-copy">No public biography yet.</p>}
      <div className="discovery-card__footer">
        {profile.followed ? <Badge tone="success">Following</Badge> : <span />}
        <Link className="workspace-inline-link" href={`/u/${encodeURIComponent(profile.handle)}`}>Open profile</Link>
      </div>
    </Card>
  );
}
