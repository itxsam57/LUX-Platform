// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /health", () => {
  it("returns the stable public health contract", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T00:00:00.000Z"));

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "lux-web",
      status: "ok",
      buildSlice: 3,
      timestamp: "2026-08-23T00:00:00.000Z",
    });

    vi.useRealTimers();
  });
});
