import { describe, expect, it } from "vitest";
import {
  canManageProjectCommunication,
  canTransitionInvitation,
  invitationAcceptanceCreatesLegalConsent,
  shouldInvalidateInvitationAcceptance,
} from "./policy";

describe("collaboration invitation policy", () => {
  it("allows only explicit lifecycle transitions", () => {
    expect(canTransitionInvitation("sent", "viewed")).toBe(true);
    expect(canTransitionInvitation("viewed", "interested")).toBe(true);
    expect(canTransitionInvitation("interested", "negotiating")).toBe(true);
    expect(canTransitionInvitation("negotiating", "accepted")).toBe(true);
    expect(canTransitionInvitation("accepted", "declined")).toBe(false);
    expect(canTransitionInvitation("declined", "accepted")).toBe(false);
    expect(canTransitionInvitation("withdrawn", "viewed")).toBe(false);
  });

  it("keeps quiet decline terminal and private to collaboration participants", () => {
    expect(canTransitionInvitation("sent", "declined")).toBe(true);
    expect(canTransitionInvitation("declined", "interested")).toBe(false);
  });

  it("lets project owners manage communication", () => {
    expect(canManageProjectCommunication({ actorIsOwner: true, actorHasAgencyAuthority: false, relationshipBlocked: false })).toBe(true);
  });

  it("lets an agency act only under explicit active communication authority", () => {
    expect(canManageProjectCommunication({ actorIsOwner: false, actorHasAgencyAuthority: true, relationshipBlocked: false })).toBe(true);
    expect(canManageProjectCommunication({ actorIsOwner: false, actorHasAgencyAuthority: false, relationshipBlocked: false })).toBe(false);
  });

  it("denies communication across a relevant block", () => {
    expect(canManageProjectCommunication({ actorIsOwner: true, actorHasAgencyAuthority: false, relationshipBlocked: true })).toBe(false);
  });

  it("invalidates an accepted invitation when its exact project revision becomes stale", () => {
    expect(shouldInvalidateInvitationAcceptance({ state: "accepted", boundRevision: 2, currentRevision: 3 })).toBe(true);
    expect(shouldInvalidateInvitationAcceptance({ state: "accepted", boundRevision: 3, currentRevision: 3 })).toBe(false);
  });

  it("never treats invitation acceptance as legal contract or depicted-person consent", () => {
    expect(invitationAcceptanceCreatesLegalConsent("accepted")).toBe(false);
  });
});
