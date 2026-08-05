import { describe, expect, it } from "vitest";
import { FOUNDATION_SLICE, isFoundationRoute } from "./foundation";

describe("foundation contracts", () => {
  it("identifies the active build slice", () => {
    expect(FOUNDATION_SLICE.id).toBe("slice-1");
    expect(FOUNDATION_SLICE.number).toBe(1);
    expect(FOUNDATION_SLICE.healthStatus).toBe("ok");
  });

  it.each(["/", "/design-system", "/health"])("recognizes %s", (route) => {
    expect(isFoundationRoute(route)).toBe(true);
  });

  it("rejects routes not included in the foundation", () => {
    expect(isFoundationRoute("/dashboard")).toBe(false);
  });
});
