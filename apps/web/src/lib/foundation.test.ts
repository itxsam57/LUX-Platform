import { describe, expect, it } from "vitest";
import { FOUNDATION_SLICE, isFoundationRoute } from "./foundation";

describe("foundation contracts", () => {
  it("identifies Slice 6 Crowd Demand Board as the active build slice", () => {
    expect(FOUNDATION_SLICE.id).toBe("slice-6");
    expect(FOUNDATION_SLICE.number).toBe(6);
    expect(FOUNDATION_SLICE.name).toBe("Crowd Demand Board");
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
    "/workspace",
    "/settings/security",
    "/settings/profile",
    "/settings/privacy",
    "/settings/privacy/export",
    "/settings/verification",
    "/notifications",
    "/app/feed",
    "/app/explore",
    "/app/search",
    "/workspace/staff/verification",
    "/app/demand",
    "/app/demand/new",
    "/workspace/creator/demand",
  ])("recognizes %s", (route) => {
    expect(isFoundationRoute(route)).toBe(true);
  });

  it("rejects routes outside the active foundation", () => {
    expect(isFoundationRoute("/campaigns")).toBe(false);
  });
});
