import Link from "next/link";
import { FOUNDATION_SLICE } from "../lib/foundation";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Verification with privacy-first identity boundaries</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          Adult accounts can use provider-neutral identity and depicted-person verification while legal identity evidence stays private, reviewer authority stays constrained, and public surfaces expose only safe verification state.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Build Slice {FOUNDATION_SLICE.number}: {FOUNDATION_SLICE.name}</span>
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
