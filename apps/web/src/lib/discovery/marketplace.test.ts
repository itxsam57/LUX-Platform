import { describe, expect, it } from "vitest";
import { marketplaceCursor, parseMarketplaceFilter, parseMarketplaceItems } from "./marketplace";

describe("marketplace discovery projection", () => {
  it("parses mixed public discovery items and a cursor", () => {
    const items = parseMarketplaceItems([{
      type: "campaign",
      publicId: "cmp" + "a".repeat(24),
      title: "Campaign",
      subtitle: "Public synopsis",
      path: "/p/cmp" + "a".repeat(24),
      createdAt: "2026-10-07T00:00:00.000Z",
      meta: { state: "published" },
    }]);
    expect(items).toHaveLength(1);
    expect(marketplaceCursor(items)).toBe("2026-10-07T00:00:00.000Z");
    expect(parseMarketplaceFilter("release")).toBe("release");
    expect(parseMarketplaceFilter("bad")).toBe("all");
  });
});
