import { describe, expect, it } from "vitest";
import { parseOptionalIsoDate, parseProductionWorkspace } from "./policy";

describe("production date input", () => {
  it("normalizes valid optional dates and rejects malformed values", () => {
    expect(parseOptionalIsoDate("")).toBeNull();
    expect(parseOptionalIsoDate("2026-12-01T10:30")).toBe("2026-12-01T10:30:00.000Z");
    expect(parseOptionalIsoDate("definitely-not-a-date")).toBeUndefined();
  });
});

describe("production workspace projection", () => {
  it("accepts the private member-safe workspace shape", () => {
    const result = parseProductionWorkspace({
      projectPublicId: "prj0123456789abcdef01234567",
      title: "A production",
      projectState: "contract_locked",
      isOwner: false,
      status: "delayed",
      revisedEstimate: "2026-12-01T00:00:00.000Z",
      milestones: [{
        publicId: "mil0123456789abcdef01234567",
        title: "Principal photography",
        dueAt: "2026-11-01T00:00:00.000Z",
        status: "in_progress",
        updatedAt: "2026-09-10T00:00:00.000Z",
      }],
      tasks: [{
        publicId: "tsk0123456789abcdef01234567",
        title: "Lock edit",
        roleName: "editor",
        status: "todo",
        assignedToMe: true,
        milestonePublicId: "mil0123456789abcdef01234567",
        updatedAt: "2026-09-10T00:00:00.000Z",
      }],
      assets: [{
        publicId: "ast0123456789abcdef01234567",
        kind: "media",
        sha256: "a".repeat(64),
        createdAt: "2026-09-10T00:00:00.000Z",
      }],
      updates: [{
        publicId: "upd0123456789abcdef01234567",
        kind: "delay",
        state: "published",
        body: "Delivery moved while the final edit is completed.",
        revisedEstimate: "2026-12-01T00:00:00.000Z",
        createdAt: "2026-09-10T00:00:00.000Z",
        publishedAt: "2026-09-10T01:00:00.000Z",
      }],
    });

    expect(result?.projectPublicId).toBe("prj0123456789abcdef01234567");
    expect(result?.tasks[0]?.assignedToMe).toBe(true);
    expect(result?.assets[0]?.sha256).toBe("a".repeat(64));
  });

  it("rejects internal identifiers and malformed private asset metadata", () => {
    expect(parseProductionWorkspace({
      projectPublicId: "00000000-0000-0000-0000-000000000001",
      title: "Bad",
      projectState: "draft",
      isOwner: true,
      status: "planned",
      revisedEstimate: null,
      milestones: [],
      tasks: [],
      assets: [{ publicId: "astbad", kind: "media", sha256: "secret", createdAt: "today" }],
      updates: [],
    })).toBeNull();
  });
});
