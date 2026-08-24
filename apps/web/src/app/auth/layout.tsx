import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Link className="app-brand" href="/">
          <span className="app-brand__mark" aria-hidden="true">L</span>
          <span>
            <strong>LUX</strong>
            <small>Account security</small>
          </span>
        </Link>
        <Badge tone={configured ? "success" : "warning"}>
          {configured ? "Secure session" : "Configuration required"}
        </Badge>
      </header>
      {!configured ? (
        <div className="auth-config-warning" role="status">
          Supabase environment variables are missing. The interface is visible, but authentication cannot run until the environment contract is configured.
        </div>
      ) : null}
      <div className="auth-content">{children}</div>
      <footer className="auth-footer">
        <span>One account. Separate approved workspaces.</span>
        <Link href="/design-system">Design system</Link>
      </footer>
    </main>
  );
}
