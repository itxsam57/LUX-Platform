import { redirect } from "next/navigation";
import { confirmAdultAccessAction } from "./actions";
import { Button, Checkbox, Input, Status } from "@/components/ui/primitives";
import { requireAuthenticatedViewer } from "@/lib/auth/context";
import {
  adultAccessSatisfied,
  normalizeNextPath,
  VIEWER_POLICY_VERSION,
} from "@/lib/auth/policy";
import { getAgeAssuranceMode } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function AgeAssurancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const viewer = await requireAuthenticatedViewer(`/age-assurance?next=${encodeURIComponent(nextPath)}`);
  const mode = getAgeAssuranceMode();

  if (adultAccessSatisfied(viewer.context, mode)) redirect(nextPath);

  const errorMessage = error === "confirmation-required"
    ? "Confirm both adult status and lawful access before continuing."
    : error === "invalid-jurisdiction"
      ? "Enter a two-letter country code such as PK, GB, or US."
      : error === "unable-to-record"
        ? "The assurance record could not be saved safely. Try again."
        : error === "provider-required"
          ? "This environment requires an approved age-assurance provider result."
          : null;

  return (
    <main className="gate-shell">
      <section className="gate-card" aria-labelledby="age-gate-title">
        <div className="gate-card__header">
          <div>
            <span className="eyebrow">Adult-only platform</span>
            <h1 id="age-gate-title">Adult access assurance</h1>
          </div>
          <Status label={mode === "self_attestation" ? "Local assurance mode" : "Provider required"} tone="warning" />
        </div>

        <p className="muted-copy">
          LUX records only the assurance decision, method, jurisdiction, policy version, and expiry. This step does not create a creator identity or depicted-person verification record.
        </p>

        {errorMessage ? <div className="auth-message auth-message--error" role="alert">{errorMessage}</div> : null}

        {mode === "provider_required" ? (
          <div className="ui-state-card ui-state-card--error" role="alert">
            <span className="ui-state-card__icon" aria-hidden="true">!</span>
            <h2>Age provider is not configured</h2>
            <p>Access remains blocked. Self-attestation is deliberately unavailable in provider-required mode.</p>
          </div>
        ) : (
          <form action={confirmAdultAccessAction} className="gate-form">
            <input type="hidden" name="next" value={nextPath} />
            <Input
              id="jurisdiction"
              name="jurisdiction"
              label="Country code"
              description="Use the two-letter code for your current legal jurisdiction."
              placeholder="PK"
              minLength={2}
              maxLength={2}
              autoCapitalize="characters"
              required
            />
            <Checkbox
              id="adult-confirmed"
              name="adult_confirmed"
              label="I confirm that I am at least 18 years old and may lawfully access an adult-only platform in this jurisdiction."
              description={`Recorded under ${VIEWER_POLICY_VERSION}. False confirmation may result in account restriction.`}
              required
            />
            <Button type="submit" size="large">Confirm and continue</Button>
          </form>
        )}
      </section>
    </main>
  );
}
