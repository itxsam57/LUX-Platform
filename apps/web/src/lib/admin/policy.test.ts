import { describe, expect, it } from "vitest";
import {
  ADMIN_QUEUE_KEYS,
  parseAuditExplorerRows,
  parseAdminOverview,
  parseAdminQueueRows,
  parseCriticalAdminAction,
  parseOperationalIncidents,
  parseOperationalRateLimitUpdate,
  parseOperationalRateLimits,
  parseOperationalSearch,
  parseOperationalSearchResults,
  staffCanAccessAdminQueue,
} from "./policy";

describe("Slice 17 admin policy", () => {
  it("keeps every operational queue behind the intended staff role", () => {
    expect(ADMIN_QUEUE_KEYS).toEqual([
      "users",
      "roles",
      "verification",
      "projects",
      "campaigns",
      "moderation",
      "review",
      "copyright",
      "finance",
      "payouts",
      "support",
      "configuration",
      "audit",
      "incidents",
    ]);

    expect(staffCanAccessAdminQueue("reviewer", "verification")).toBe(true);
    expect(staffCanAccessAdminQueue("reviewer", "review")).toBe(true);
    expect(staffCanAccessAdminQueue("reviewer", "finance")).toBe(false);

    expect(staffCanAccessAdminQueue("moderator", "moderation")).toBe(true);
    expect(staffCanAccessAdminQueue("moderator", "users")).toBe(false);

    expect(staffCanAccessAdminQueue("finance", "finance")).toBe(true);
    expect(staffCanAccessAdminQueue("finance", "payouts")).toBe(true);
    expect(staffCanAccessAdminQueue("finance", "copyright")).toBe(false);

    expect(staffCanAccessAdminQueue("copyright", "copyright")).toBe(true);
    expect(staffCanAccessAdminQueue("support", "users")).toBe(true);
    expect(staffCanAccessAdminQueue("support", "support")).toBe(true);
    expect(staffCanAccessAdminQueue("support", "configuration")).toBe(false);

    for (const queue of ADMIN_QUEUE_KEYS) {
      expect(staffCanAccessAdminQueue("super_admin", queue)).toBe(true);
    }
  });

  it("requires explicit confirmation and a meaningful reason for critical actions", () => {
    expect(parseCriticalAdminAction({
      action: "place_legal_hold",
      targetPublicId: "rel_12345678",
      reason: "Active court preservation request",
      confirmation: "CONFIRM",
    })).toEqual({
      action: "place_legal_hold",
      targetPublicId: "rel_12345678",
      reason: "Active court preservation request",
    });

    expect(parseCriticalAdminAction({
      action: "place_legal_hold",
      targetPublicId: "rel_12345678",
      reason: "Active court preservation request",
      confirmation: "confirm",
    })).toBeNull();

    expect(parseCriticalAdminAction({
      action: "resolve_incident",
      targetPublicId: "inc_12345678",
      reason: "short",
      confirmation: "CONFIRM",
    })).toBeNull();
  });

  it("normalizes operational search without accepting empty or oversized input", () => {
    expect(parseOperationalSearch("  Project ABC  ")).toBe("Project ABC");
    expect(parseOperationalSearch(" ")).toBeNull();
    expect(parseOperationalSearch("x".repeat(121))).toBeNull();
  });

  it("accepts only bounded safe operational projections", () => {
    expect(parseAdminOverview({ users: 12, pendingRoles: 2, verification: 1, projects: 4, campaigns: 3, moderation: 0, review: 2, copyright: 1, finance: 0, payouts: 2, support: 1, incidents: 0, legalHolds: 1, abuseHolds: 0 })?.users).toBe(12);
    expect(parseAdminOverview({ users: -1 })).toBeNull();

    expect(parseAdminQueueRows([{ kind: "project", publicId: "prj12345678", state: "draft", title: "Safe title", category: "film", updatedAt: "2026-09-10T00:00:00.000Z" }])).toHaveLength(1);
    expect(parseAdminQueueRows([{ kind: "support", publicId: "sup12345678", requesterHandle: "fan", subject: "Account recovery", state: "open", createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" }])).toHaveLength(1);
    expect(parseAdminQueueRows([{ kind: "configuration", key: "launch.release_mode", revision: 1, updatedAt: "2026-09-10T00:00:00.000Z" }])).toHaveLength(1);
    expect(parseAdminQueueRows([{ kind: "project", privateBrief: "must never parse" }])).toEqual([]);

    expect(parseOperationalSearchResults([{ kind: "project", publicId: "prj12345678", label: "Project Alpha", state: "draft", path: "/studio/projects/prj12345678" }])).toHaveLength(1);
    expect(parseOperationalSearchResults([{ kind: "project", label: "Project Alpha", path: "https://example.com" }])).toEqual([]);
  });

  it("parses incident, hold, and rate-limit projections without internal identifiers", () => {
    expect(parseOperationalIncidents({
      incidents: [{ publicId: "inc12345678", scopeKey: "platform", severity: "high", summary: "Release check failed", state: "open", openedAt: "2026-09-10T00:00:00.000Z", resolvedAt: null }],
      legalHolds: [],
      abuseHolds: [],
    })?.incidents).toHaveLength(1);
    expect(parseOperationalIncidents({ incidents: [{ id: "internal-uuid" }], legalHolds: [], abuseHolds: [] })).toBeNull();

    expect(parseOperationalRateLimits([{ key: "admin_search", maxRequests: 60, windowSeconds: 60, enabled: true, revision: 1, updatedAt: "2026-09-10T00:00:00.000Z" }])).toHaveLength(1);
    expect(parseOperationalRateLimits([{ key: "admin_search", maxRequests: 0, windowSeconds: 60, enabled: true, revision: 1, updatedAt: "2026-09-10T00:00:00.000Z" }])).toEqual([]);
  });

  it("parses only the public audit explorer projection", () => {
    expect(parseAuditExplorerRows([{
      eventType: "admin_queue_viewed",
      outcome: "success",
      routeKey: "workspace-staff-admin",
      targetRole: "super_admin",
      actorHandle: "operator",
      createdAt: "2026-09-10T00:00:00.000Z",
    }])).toHaveLength(1);
    expect(parseAuditExplorerRows([{
      eventType: "admin_queue_viewed",
      actorUserId: "internal-user-id",
      createdAt: "2026-09-10T00:00:00.000Z",
    }])).toEqual([]);
  });

  it("requires bounded rate-limit values, confirmation, and reason before mutation", () => {
    expect(parseOperationalRateLimitUpdate({
      key: "admin_search",
      maxRequests: "90",
      windowSeconds: "60",
      enabled: "true",
      reason: "Tune staff search capacity after load verification",
      confirmation: "CONFIRM",
    })).toEqual({
      key: "admin_search",
      maxRequests: 90,
      windowSeconds: 60,
      enabled: true,
      reason: "Tune staff search capacity after load verification",
    });

    expect(parseOperationalRateLimitUpdate({
      key: "admin_search",
      maxRequests: "10001",
      windowSeconds: "60",
      enabled: "true",
      reason: "Tune staff search capacity after load verification",
      confirmation: "CONFIRM",
    })).toBeNull();

    expect(parseOperationalRateLimitUpdate({
      key: "admin_search",
      maxRequests: "90",
      windowSeconds: "60",
      enabled: "true",
      reason: "Tune staff search capacity after load verification",
      confirmation: "confirm",
    })).toBeNull();
  });
});
