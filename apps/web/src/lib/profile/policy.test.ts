import { describe, expect, it } from "vitest";
import {
  canViewProfile,
  normalizeHandle,
  normalizeLanguageTag,
  resolveSupporterIdentity,
  sanitizeProfileLinks,
  validateBio,
  validateDisplayName,
  validateHandle,
  validateLanguageTag,
  validateProfileMedia,
} from "./policy";

describe("profile policy", () => {
  it("normalizes handles and blocks reserved or malformed values", () => {
    expect(normalizeHandle("  Creator_Name ")).toBe("creator_name");
    expect(validateHandle("sam_57")).toBeNull();
    expect(validateHandle("admin")).toBe("That handle is reserved.");
    expect(validateHandle("Bad-Handle")).toContain("lowercase");
    expect(validateHandle("ab")).toContain("3–30");
  });

  it("validates display names and biographies as plain bounded text", () => {
    expect(validateDisplayName("Sam")).toBeNull();
    expect(validateDisplayName("   ")).toBe("Enter a display name.");
    expect(validateDisplayName("x".repeat(81))).toContain("80");
    expect(validateDisplayName("Sam\u0000")).toContain("control");
    expect(validateBio("x".repeat(500))).toBeNull();
    expect(validateBio("x".repeat(501))).toContain("500");
    expect(validateBio("hello\u0007")).toContain("control");
  });

  it("allows at most five safe HTTPS profile links", () => {
    expect(sanitizeProfileLinks([
      { label: "Site", url: "https://example.com/path" },
    ])).toEqual({
      links: [{ label: "Site", url: "https://example.com/path" }],
      error: null,
    });

    expect(sanitizeProfileLinks([{ label: "Bad", url: "javascript:alert(1)" }]).error).toContain("HTTPS");
    expect(sanitizeProfileLinks([{ label: "Bad", url: "https://user:pass@example.com" }]).error).toContain("credentials");
    expect(sanitizeProfileLinks(Array.from({ length: 6 }, (_, index) => ({
      label: `L${index}`,
      url: `https://example.com/${index}`,
    }))).error).toContain("five");
  });

  it("normalizes and validates language tags without inferring private metadata", () => {
    expect(normalizeLanguageTag(" EN-us ")).toBe("en-US");
    expect(validateLanguageTag("en")).toBeNull();
    expect(validateLanguageTag("en-US")).toBeNull();
    expect(validateLanguageTag("not_a_tag")).toContain("language");
  });

  it("resolves supporter identity from one durable anonymity rule", () => {
    const profile = { handle: "sam", displayName: "Sam" };
    expect(resolveSupporterIdentity(profile, true)).toEqual({
      kind: "anonymous",
      label: "Anonymous supporter",
    });
    expect(resolveSupporterIdentity(profile, false)).toEqual({
      kind: "profile",
      handle: "sam",
      label: "Sam",
    });
  });

  it("keeps private profiles owner-only while public and unlisted remain directly viewable", () => {
    expect(canViewProfile("public", false)).toBe(true);
    expect(canViewProfile("unlisted", false)).toBe(true);
    expect(canViewProfile("private", false)).toBe(false);
    expect(canViewProfile("private", true)).toBe(true);
  });

  it("enforces media type and size policy independently of upload code", () => {
    expect(validateProfileMedia("avatar", "image/jpeg", 5 * 1024 * 1024)).toBeNull();
    expect(validateProfileMedia("avatar", "image/jpeg", 5 * 1024 * 1024 + 1)).toContain("5 MiB");
    expect(validateProfileMedia("banner", "image/webp", 10 * 1024 * 1024)).toBeNull();
    expect(validateProfileMedia("banner", "image/png", 10 * 1024 * 1024 + 1)).toContain("10 MiB");
    expect(validateProfileMedia("avatar", "image/gif", 100)).toContain("JPEG, PNG, or WebP");
  });
});
