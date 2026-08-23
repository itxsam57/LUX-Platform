"use client";

import { useActionState, useState } from "react";
import {
  cancelDeletionRequestAction,
  INITIAL_PRIVACY_ACTION_STATE,
  removePrivateRelationshipAction,
  setSupporterPrivacyAction,
  submitDeletionRequestAction,
} from "@/app/settings/privacy/actions";
import { Button, Input, Switch } from "@/components/ui/primitives";
import { resolveSupporterIdentity, type PublicSupporterProfile } from "@/lib/profile/policy";

type PrivateRelationship = { handle: string; displayName: string };

function Message({ status, message }: { status: string; message: string }) {
  if (!message) return null;
  return <p className={status === "error" ? "auth-message auth-message--error" : "auth-message auth-message--success"} role={status === "error" ? "alert" : "status"}>{message}</p>;
}

function RelationshipRow({ item, action }: { item: PrivateRelationship; action: "unblock" | "unmute" }) {
  const [state, formAction, pending] = useActionState(removePrivateRelationshipAction, INITIAL_PRIVACY_ACTION_STATE);
  if (state.status === "success") {
    return <li className="privacy-relationship-row privacy-relationship-row--removed"><span>@{item.handle}</span><Message status={state.status} message={state.message} /></li>;
  }
  return (
    <li className="privacy-relationship-row">
      <div><strong>{item.displayName}</strong><span>@{item.handle}</span></div>
      <form action={formAction}>
        <input type="hidden" name="target_handle" value={item.handle} />
        <input type="hidden" name="relationship_action" value={action} />
        <Button type="submit" variant="secondary" size="small" loading={pending}>{action === "unblock" ? "Unblock" : "Unmute"}</Button>
      </form>
      <Message status={state.status} message={state.message} />
    </li>
  );
}

export function PrivacySettings({
  anonymousByDefault,
  supporterProfile,
  deletionStatus,
  blocks,
  mutes,
}: {
  anonymousByDefault: boolean;
  supporterProfile: PublicSupporterProfile;
  deletionStatus: string | null;
  blocks: PrivateRelationship[];
  mutes: PrivateRelationship[];
}) {
  const [supportState, supportAction, savingSupport] = useActionState(setSupporterPrivacyAction, INITIAL_PRIVACY_ACTION_STATE);
  const [deleteState, deleteAction, deleting] = useActionState(submitDeletionRequestAction, INITIAL_PRIVACY_ACTION_STATE);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelDeletionRequestAction, INITIAL_PRIVACY_ACTION_STATE);
  const [anonymousPreference, setAnonymousPreference] = useState(anonymousByDefault);
  const supporterIdentity = resolveSupporterIdentity(supporterProfile, anonymousPreference);

  return (
    <div className="privacy-settings-stack">
      <section className="ui-card privacy-card">
        <div><span className="eyebrow">Support identity</span><h2>Anonymous by default</h2><p className="muted-copy">This controls the identity LUX may show with future support activity. Anonymous is the default and can be changed without adult assurance.</p></div>
        <form action={supportAction} className="privacy-form">
          <Switch
            id="anonymous-by-default"
            name="anonymous_by_default"
            label="Keep future support anonymous by default"
            description="Turning this off allows your public profile identity to be used where a later support flow explicitly permits it."
            checked={anonymousPreference}
            onChange={(event) => setAnonymousPreference(event.currentTarget.checked)}
          />
          <div className="supporter-preview" aria-live="polite" data-testid="supporter-identity-preview">
            <span className="eyebrow">How supporters will see you</span>
            <strong>{supporterIdentity.label}</strong>
            {supporterIdentity.kind === "profile" ? <span>@{supporterIdentity.handle}</span> : <span>Your public profile stays hidden from the support identity.</span>}
          </div>
          <Button type="submit" variant="secondary" loading={savingSupport}>Save supporter privacy</Button>
          <Message status={supportState.status} message={supportState.message} />
        </form>
      </section>

      <section className="ui-card privacy-card">
        <div><span className="eyebrow">Private relationships</span><h2>Blocked and muted profiles</h2><p className="muted-copy">These lists are private to your account. Removing an existing block or mute remains available even if adult assurance has expired.</p></div>
        <div className="privacy-relationship-grid">
          <div><h3>Blocked</h3>{blocks.length ? <ul className="privacy-relationship-list">{blocks.map((item) => <RelationshipRow key={`block-${item.handle}`} item={item} action="unblock" />)}</ul> : <p className="muted-copy">No blocked profiles.</p>}</div>
          <div><h3>Muted</h3>{mutes.length ? <ul className="privacy-relationship-list">{mutes.map((item) => <RelationshipRow key={`mute-${item.handle}`} item={item} action="unmute" />)}</ul> : <p className="muted-copy">No muted profiles.</p>}</div>
        </div>
      </section>

      <section className="ui-card privacy-card">
        <div><span className="eyebrow">Your data</span><h2>Export account data</h2><p className="muted-copy">The export contains an explicit owner-only allowlist. Passwords, auth tokens, age-assurance records, and internal secrets are never included.</p></div>
        <a className="ui-button ui-button--secondary ui-button--medium" href="/settings/privacy/export">Download JSON export</a>
      </section>

      <section className="ui-card privacy-card privacy-card--danger">
        <div><span className="eyebrow">Account deletion</span><h2>Request deletion</h2><p className="muted-copy">Current request: {deletionStatus ?? "none"}. A repeated request is idempotent and does not create duplicate active requests.</p></div>
        <form action={deleteAction} className="privacy-form">
          <Input id="deletion-confirmation" name="confirmation" label="Confirmation phrase" description="Type DELETE MY LUX ACCOUNT exactly." autoComplete="off" />
          <Button type="submit" variant="danger" loading={deleting}>Submit deletion request</Button>
          <Message status={deleteState.status} message={deleteState.message} />
        </form>
        <form action={cancelAction} className="privacy-form">
          <Button type="submit" variant="secondary" loading={cancelling}>Cancel submitted deletion request</Button>
          <Message status={cancelState.status} message={cancelState.message} />
        </form>
      </section>
    </div>
  );
}
