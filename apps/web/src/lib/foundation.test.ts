import { describe, expect, it } from "vitest";
import { FOUNDATION_SLICE, isFoundationRoute } from "./foundation";

describe("foundation contracts", () => {
  it("identifies the active build slice", () => {
    expect(FOUNDATION_SLICE.id).toBe("slice-2");
    expect(FOUNDATION_SLICE.number).toBe(2);
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
  ])("recognizes %s", (route) => {
    expect(isFoundationRoute(route)).toBe(true);
  });

  it("rejects routes outside the active foundation", () => {
    expect(isFoundationRoute("/campaigns")).toBe(false);
  });
});
