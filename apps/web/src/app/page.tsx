import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Shared application foundation</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          Crowd-demanded productions with creator control, verified consent, restricted funds,
          review-gated release, and auditable payouts.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Build Slice 1: design system and application shell</span>
        </div>
        <Link className="ui-button ui-button--primary ui-button--medium" href="/design-system">
          Open design-system catalogue
        </Link>
      </section>
    </main>
  );
}
