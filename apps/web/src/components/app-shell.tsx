import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "./ui/primitives";

const catalogueLinks = [
  ["Tokens", "#tokens"],
  ["Actions", "#actions"],
  ["Forms", "#forms"],
  ["Data", "#data-display"],
  ["Navigation", "#navigation"],
  ["Feedback", "#feedback"],
  ["Overlays", "#overlays"],
] as const;

const alignedNavText = {
  display: "inline-flex",
  alignItems: "center",
  lineHeight: 1,
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="app-sidebar" aria-label="Design system sections">
        <Link className="app-brand" href="/">
          <span className="app-brand__mark" aria-hidden="true">
            L
          </span>
          <span>
            <strong>LUX</strong>
            <small>System</small>
          </span>
        </Link>
        <nav className="app-sidebar__nav">
          {catalogueLinks.map(([label, href], index) => (
            <a
              className={index === 0 ? "app-nav-link app-nav-link--active" : "app-nav-link"}
              href={href}
              key={href}
            >
              <span aria-hidden="true" style={alignedNavText}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  ...alignedNavText,
                  color: "inherit",
                  fontSize: "inherit",
                  fontVariantNumeric: "normal",
                }}
              >
                {label}
              </span>
            </a>
          ))}
        </nav>
        <div className="app-sidebar__footer">
          <Badge tone="success">Slice 1</Badge>
          <p>Shared primitives only. No dashboard-specific behavior.</p>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div>
            <span className="app-topbar__context">Internal catalogue</span>
            <strong>Design system and shell</strong>
          </div>
          <div className="app-topbar__actions">
            <Badge tone="accent">Keyboard ready</Badge>
            <Link className="app-topbar__home" href="/">
              Home
            </Link>
          </div>
        </header>
        {children}
      </div>
      <nav className="app-mobile-nav" aria-label="Mobile catalogue navigation">
        <Link href="/">Home</Link>
        <a href="#actions">Actions</a>
        <a href="#forms">Forms</a>
        <a href="#feedback">Feedback</a>
      </nav>
    </div>
  );
}
