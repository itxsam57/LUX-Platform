import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Discovery with privacy-first identity</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          Adult accounts can discover public creators through privacy-safe feed, explore, and search surfaces while creator choice, blocks, profile visibility, and isolated workspaces remain authoritative.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Build Slice 4: feed and discovery</span>
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
