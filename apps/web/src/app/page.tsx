import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Identity and workspace foundation</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          One verified adult account with separate, approved fan, creator, agency, and staff workspaces. Audience demand never overrides creator choice.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Build Slice 2: authentication, age assurance, and workspace isolation</span>
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
