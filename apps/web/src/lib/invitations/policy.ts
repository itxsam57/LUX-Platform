export type ProjectInvitationState =
  | "sent"
  | "viewed"
  | "interested"
  | "considering"
  | "negotiating"
  | "accepted"
  | "declined"
  | "expired"
  | "withdrawn";

const transitions: Record<ProjectInvitationState, ReadonlySet<ProjectInvitationState>> = {
  sent: new Set(["viewed", "interested", "considering", "declined", "expired", "withdrawn"]),
  viewed: new Set(["interested", "considering", "negotiating", "accepted", "declined", "expired", "withdrawn"]),
  interested: new Set(["considering", "negotiating", "accepted", "declined", "expired", "withdrawn"]),
  considering: new Set(["interested", "negotiating", "accepted", "declined", "expired", "withdrawn"]),
  negotiating: new Set(["interested", "considering", "accepted", "declined", "expired", "withdrawn"]),
  accepted: new Set(),
  declined: new Set(),
  expired: new Set(),
  withdrawn: new Set(),
};

export function canTransitionInvitation(from: ProjectInvitationState, to: ProjectInvitationState): boolean {
  return transitions[from].has(to);
}

export function canManageProjectCommunication(input: {
  actorIsOwner: boolean;
  actorHasAgencyAuthority: boolean;
  relationshipBlocked: boolean;
}): boolean {
  return !input.relationshipBlocked && (input.actorIsOwner || input.actorHasAgencyAuthority);
}

export function shouldInvalidateInvitationAcceptance(input: {
  state: ProjectInvitationState;
  boundRevision: number;
  currentRevision: number;
}): boolean {
  return input.state === "accepted" && input.boundRevision !== input.currentRevision;
}

export function invitationAcceptanceCreatesLegalConsent(): false {
  return false;
}
