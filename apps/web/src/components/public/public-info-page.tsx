import Link from "next/link";
import type { ReactNode } from "react";

export function PublicInfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="page-shell">
      <article className="hero-card">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="lede">{intro}</p>
        <div className="workspace-stack">{children}</div>
        <nav className="component-row" aria-label="Public information navigation">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/help">Help</Link>
        </nav>
      </article>
    </main>
  );
}

export function PublicInfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
