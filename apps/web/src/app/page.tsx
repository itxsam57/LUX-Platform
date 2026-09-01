import Link from "next/link";
import { FOUNDATION_SLICE } from "../lib/foundation";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Creator-controlled marketplace through funding</span>
        <h1>LUX Platform</h1>
        <p className="lede">
          Adult fans can discover creators, signal demand, and support published campaigns while creators and depicted people keep control over participation, negotiation, exact terms, consent, and release decisions. Current funding flows use privacy-safe persisted state; synthetic identity and payment adapters remain development and CI tools only.
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
