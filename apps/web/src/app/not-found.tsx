export default function NotFound() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">404</span>
        <h1>Not found</h1>
        <p className="lede">This route does not exist or is not available in the current build slice.</p>
        <a className="primary-button" href="/">Return home</a>
      </section>
    </main>
  );
}
