import Link from "next/link";

export default function DesignSystemPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Internal preview</span>
        <h1>Design system</h1>
        <p className="lede">
          This route will become the controlled component catalogue for tokens, typography,
          buttons, forms, cards, feedback states, navigation, and accessibility behavior.
        </p>
        <Link className="primary-button" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
