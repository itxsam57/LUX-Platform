import Link from "next/link";
import { LinkButton } from "@/components/ui/primitives";
import { normalizeNextPath } from "@/lib/auth/policy";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = normalizeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);

  return (
    <section className="auth-card" aria-labelledby="check-email-title">
      <span className="eyebrow">Verification required</span>
      <h1 id="check-email-title">Check your email</h1>
      <p className="muted-copy">
        Open the newest LUX verification message. Verification links are time-limited and may be used only once.
      </p>
      <div className="auth-message auth-message--info" role="status">
        No workspace becomes available until Supabase confirms the email address.
      </div>
      <div className="auth-card__actions">
        <LinkButton href={`/auth/login?next=${encodeURIComponent(next)}`}>Return to sign in</LinkButton>
        <Link href="/auth/forgot-password">Need account recovery?</Link>
      </div>
    </section>
  );
}
