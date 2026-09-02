import { describe, expect, it } from "vitest";
import { hashContractVersion } from "./version-hash";

describe("contract version hashing", () => {
  it("is stable across object key order", () => {
    const first = hashContractVersion({ role: "performer", boundaries: ["closed-set"], compensation: { currency: "USD", amountMinor: 10000 } });
    const second = hashContractVersion({ compensation: { amountMinor: 10000, currency: "USD" }, boundaries: ["closed-set"], role: "performer" });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when material data changes", () => expect(hashContractVersion({ role: "performer" })).not.toBe(hashContractVersion({ role: "editor" })));
});
