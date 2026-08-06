import { AuthForm } from "@/components/auth/auth-form";
import { normalizeNextPath } from "@/lib/auth/policy";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = normalizeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  const message = reason === "session-expired"
    ? "That session was revoked or expired. Sign in again to continue."
    : notice === "all-devices-signed-out"
      ? "All LUX sessions were signed out."
      : notice === "signed-out"
        ? "This device was signed out."
        : error === "invalid-or-expired-link"
          ? "That verification or recovery link is invalid or expired."
          : error === "configuration"
            ? "Authentication is not configured for this environment."
            : null;

  return (
    <div className="auth-page-stack">
      {message ? <div className="auth-message auth-message--info" role="status">{message}</div> : null}
      <AuthForm mode="login" next={next} />
    </div>
  );
}
