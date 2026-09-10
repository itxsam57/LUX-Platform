import { describe, expect, it } from "vitest";
import { FOUNDATION_SLICE, isFoundationRoute } from "./foundation";

describe("foundation contracts", () => {
  it("identifies Slice 17 Administration and Launch Hardening as the active Milestone 1 build slice", () => {
    expect(FOUNDATION_SLICE.id).toBe("slice-17");
    expect(FOUNDATION_SLICE.number).toBe(17);
    expect(FOUNDATION_SLICE.name).toBe("Administration and Launch Hardening");
    expect(FOUNDATION_SLICE.healthStatus).toBe("ok");
  });

  it.each([
    "/",
    "/design-system",
    "/health",
    "/auth/login",
    "/auth/sign-up",
    "/auth/forgot-password",
    "/auth/check-email",
    "/age-assurance",
    "/access-denied",
    "/workspace",
    "/workspace/fan",
    "/workspace/creator",
    "/workspace/agency",
    "/workspace/staff",
    "/workspace/staff/role-requests",
    "/workspace/staff/verification",
    "/workspace/creator/demand",
    "/settings/security",
    "/settings/profile",
    "/settings/privacy",
    "/settings/privacy/export",
    "/settings/verification",
    "/notifications",
    "/app/feed",
    "/app/explore",
    "/app/search",
    "/app/demand",
    "/app/demand/new",
    "/app/funding",
    "/app/earnings",
    "/app/copyright",
    "/studio/projects",
    "/studio/projects/new",
    "/studio/invitations",
    "/workspace/staff/delivery-review",
    "/workspace/staff/finance",
    "/workspace/staff/copyright",
    "/workspace/staff/agency-verification",
    "/workspace/staff/operations",
    "/privacy",
    "/terms",
    "/help",
  ])("recognizes %s", (route) => {
    expect(isFoundationRoute(route)).toBe(true);
  });

  it("rejects dynamic or future routes outside the static active foundation", () => {
    expect(isFoundationRoute("/campaigns")).toBe(false);
    expect(isFoundationRoute("/studio/projects/prj-example")).toBe(false);
  });
});
