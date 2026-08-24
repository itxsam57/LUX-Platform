import Link from "next/link";

export function FeedTabs({ mode }: { mode: "following" | "for_you" }) {
  return (
    <nav className="discovery-tabs" aria-label="Feed mode">
      <Link className={mode === "for_you" ? "discovery-tab discovery-tab--active" : "discovery-tab"} href="/app/feed?mode=for_you" aria-current={mode === "for_you" ? "page" : undefined}>
        For You
      </Link>
      <Link className={mode === "following" ? "discovery-tab discovery-tab--active" : "discovery-tab"} href="/app/feed?mode=following" aria-current={mode === "following" ? "page" : undefined}>
        Following
      </Link>
    </nav>
  );
}
