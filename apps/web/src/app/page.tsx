import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Profiles, privacy, and isolated workspaces</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          One adult account with separate workspaces, a single privacy-first public identity, guarded profile media, and owner-controlled social boundaries. Audience demand never overrides creator choice.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Build Slice 3: profiles, privacy, media, and social boundaries</span>
        </div>
        <div className="component-row">
          <Link className="ui-button ui-button--primary ui-button--medium" href="/auth/sign-up">
            Create account
          </Link>
          <Link className="ui-button ui-button--secondary ui-button--medium" href="/auth/login">
            Sign in
          </Link>
          <Link className="ui-button ui-button--quiet ui-button--medium" href="/design-system">
            Design system
          </Link>
        </div>
      </section>
    </main>
  );
}
