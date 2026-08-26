import {
  proposeInvitationChangeAction,
  respondInvitationAction,
  withdrawInvitationAction,
} from "@/app/studio/actions";

export function InvitationPanel({ invitation }: { invitation: Record<string, unknown> }) {
  const id = typeof invitation.publicId === "string" ? invitation.publicId : "";
  const state = typeof invitation.state === "string" ? invitation.state : "unknown";
  const proposalVersion = typeof invitation.proposalVersion === "number" ? invitation.proposalVersion : 1;
  const stale = invitation.stale === true;
  const project = invitation.project && typeof invitation.project === "object" && !Array.isArray(invitation.project)
    ? invitation.project as Record<string, unknown> : {};
  const proposal = invitation.proposal && typeof invitation.proposal === "object" && !Array.isArray(invitation.proposal)
    ? invitation.proposal as Record<string, unknown> : {};
  return (
    <div className="studio-stack">
      <section className="studio-card">
        <div className="studio-meta"><span>State: {state}</span><span>Proposal v{proposalVersion}</span>{stale ? <span>Needs reconsideration</span> : null}</div>
        <h2>{typeof project.title === "string" ? project.title : "Project invitation"}</h2>
        <p>{typeof project.publicSynopsis === "string" ? project.publicSynopsis : ""}</p>
        <div className="studio-private"><strong>Private production brief</strong><p>{typeof project.privateBrief === "string" ? project.privateBrief : ""}</p></div>
        <p><strong>Role:</strong> {typeof invitation.roleName === "string" ? invitation.roleName : "collaborator"}</p>
        <p><strong>Current proposal:</strong> {typeof proposal.note === "string" ? proposal.note : "No additional note."}</p>
        <p className="studio-warning">Accepting an invitation is not a contract or depicted-person consent. Contract and consent are separate later steps.</p>
      </section>
      {!(["accepted", "declined", "expired", "withdrawn"] as string[]).includes(state) ? (
        <section className="studio-card">
          <h2>Respond</h2>
          <div className="studio-actions">
            {["interested", "considering", "negotiating", "accepted", "declined"].map((next) => (
              <form action={respondInvitationAction} key={next}>
                <input type="hidden" name="invitation_public_id" value={id} />
                <input type="hidden" name="state" value={next} />
                <button className="studio-button" type="submit">{next === "declined" ? "Decline quietly" : next.replaceAll("_", " ")}</button>
              </form>
            ))}
          </div>
          <form action={proposeInvitationChangeAction} className="studio-form studio-form--compact">
            <input type="hidden" name="invitation_public_id" value={id} />
            <label>Structured proposal note<textarea name="note" rows={3} required maxLength={2000} /></label>
            <button className="studio-button" type="submit">Propose change</button>
          </form>
          <form action={withdrawInvitationAction}>
            <input type="hidden" name="invitation_public_id" value={id} />
            <button className="studio-button studio-button--quiet" type="submit">Withdraw invitation</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
