import { describe, expect, it } from "vitest";
import {
  parseMessageBody,
  parseMessageHandle,
  parseMessageThread,
  parseMessageThreadSummaries,
  parseOrders,
  parseSavedItems,
  parseWalletEntries,
} from "./policy";

describe("consumer completion parsers", () => {
  it("normalizes safe direct-message inputs", () => {
    expect(parseMessageHandle("@creator_one")).toBe("creator_one");
    expect(parseMessageHandle("bad handle")).toBeNull();
    expect(parseMessageBody(" hello ")).toBe("hello");
    expect(parseMessageBody("bad\nbody")).toBeNull();
  });

  it("parses saved-item projections without accepting unsafe paths", () => {
    expect(parseSavedItems([{
      type: "profile",
      publicId: "creator_one",
      title: "Creator One",
      subtitle: "Bio",
      path: "/u/creator_one",
      createdAt: "2026-10-07T00:00:00.000Z",
    }])).toHaveLength(1);
    expect(parseSavedItems([{
      type: "profile",
      publicId: "creator_one",
      title: "Creator One",
      subtitle: "Bio",
      path: "//evil.example",
      createdAt: "2026-10-07T00:00:00.000Z",
    }])).toEqual([]);
  });

  it("parses thread summaries and message history", () => {
    const id = "mth" + "a".repeat(24);
    expect(parseMessageThreadSummaries([{
      publicId: id,
      otherHandle: "creator_one",
      otherDisplayName: "Creator One",
      lastMessage: "hello",
      lastMessageAt: "2026-10-07T00:00:00.000Z",
      unreadCount: 2,
      path: `/messages/${id}`,
    }])).toHaveLength(1);

    expect(parseMessageThread({
      publicId: id,
      otherHandle: "creator_one",
      otherDisplayName: "Creator One",
      messages: [{
        publicId: "msg" + "b".repeat(24),
        sender: "@creator_one",
        mine: false,
        body: "hello",
        createdAt: "2026-10-07T00:00:00.000Z",
      }],
    })?.messages).toHaveLength(1);
  });

  it("parses order and wallet projections", () => {
    const order = {
      publicId: "ord" + "a".repeat(24),
      fundingPublicId: "fnd" + "b".repeat(24),
      campaignPublicId: "cmp" + "c".repeat(24),
      projectPublicId: "prj" + "d".repeat(24),
      title: "Project",
      tierTitle: "Supporter",
      state: "captured",
      requestedMinor: 5000,
      capturedMinor: 5000,
      refundedMinor: 0,
      currency: "USD",
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
      fundingPath: "/app/funding/fnd" + "b".repeat(24),
    };
    expect(parseOrders([order])).toHaveLength(1);
    expect(parseWalletEntries([{
      publicId: "wlt" + "e".repeat(24),
      orderPublicId: order.publicId,
      fundingPublicId: order.fundingPublicId,
      title: "Project",
      entryType: "purchase",
      direction: "debit",
      amountMinor: 5000,
      currency: "USD",
      createdAt: "2026-10-07T00:00:00.000Z",
    }])).toHaveLength(1);
  });
});
