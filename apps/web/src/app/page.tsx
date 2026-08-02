export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Engineering baseline</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          Crowd-demanded productions with creator control, verified consent, restricted funds,
          review-gated release, and auditable payouts.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Build Slice 0: repository and quality foundation</span>
        </div>
        <a className="primary-button" href="/design-system">
          Open design-system preview
        </a>
      </section>
    </main>
  );
}
