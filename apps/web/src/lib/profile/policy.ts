export type ProfileVisibility = "public" | "unlisted" | "private";
export type ProfileMediaKind = "avatar" | "banner";

export type ProfileLink = {
  label: string;
  url: string;
};

export type PublicSupporterProfile = {
  handle: string;
  displayName: string;
};

export type SupporterIdentity =
  | { kind: "anonymous"; label: "Anonymous supporter" }
  | { kind: "profile"; handle: string; label: string };

const RESERVED_HANDLES = new Set([
  "about",
  "account",
  "admin",
  "administrator",
  "agency",
  "api",
  "auth",
  "callback",
  "creator",
  "design-system",
  "explore",
  "feed",
  "health",
  "help",
  "login",
  "logout",
  "lux",
  "moderator",
  "notifications",
  "privacy",
  "settings",
  "signup",
  "staff",
  "support",
  "terms",
  "u",
  "workspace",
]);

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function validateHandle(handle: string): string | null {
  if (handle.length < 3 || handle.length > 30) {
    return "Use 3–30 lowercase letters, numbers, or underscores.";
  }
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
    return "Use only lowercase letters, numbers, or underscores.";
  }
  if (RESERVED_HANDLES.has(handle)) return "That handle is reserved.";
  return null;
}

export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a display name.";
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) return "Display name cannot contain control characters.";
  if (unicodeLength(trimmed) > 80) return "Use no more than 80 characters for the display name.";
  return null;
}

export function validateBio(value: string): string | null {
  if (CONTROL_CHARACTER_PATTERN.test(value)) return "Bio cannot contain control characters.";
  if (unicodeLength(value) > 500) return "Use no more than 500 characters for the bio.";
  return null;
}

export function sanitizeProfileLinks(input: ProfileLink[]): { links: ProfileLink[]; error: string | null } {
  if (input.length > 5) return { links: [], error: "Add no more than five profile links." };

  const links: ProfileLink[] = [];
  for (const item of input) {
    const label = item.label.trim();
    if (!label || CONTROL_CHARACTER_PATTERN.test(label)) {
      return { links: [], error: "Each profile link needs a plain-text label." };
    }

    let parsed: URL;
    try {
      parsed = new URL(item.url.trim());
    } catch {
      return { links: [], error: "Profile links must use valid HTTPS URLs." };
    }

    if (parsed.protocol !== "https:") {
      return { links: [], error: "Profile links must use HTTPS." };
    }
    if (parsed.username || parsed.password) {
      return { links: [], error: "Profile links cannot contain URL credentials." };
    }

    links.push({ label, url: parsed.toString() });
  }

  return { links, error: null };
}

export function normalizeLanguageTag(value: string): string {
  const parts = value.trim().split("-").filter(Boolean);
  return parts.map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (part.length === 2) return part.toUpperCase();
    return part;
  }).join("-");
}

export function validateLanguageTag(value: string): string | null {
  if (!value || value.length > 16 || !LANGUAGE_TAG_PATTERN.test(value)) {
    return "Enter a valid language tag such as en or en-US.";
  }
  return null;
}

export function resolveSupporterIdentity(
  profile: PublicSupporterProfile,
  anonymousByDefault: boolean,
): SupporterIdentity {
  if (anonymousByDefault) return { kind: "anonymous", label: "Anonymous supporter" };
  return { kind: "profile", handle: profile.handle, label: profile.displayName };
}

export function canViewProfile(visibility: ProfileVisibility, isOwner: boolean): boolean {
  return visibility !== "private" || isOwner;
}

export function validateProfileMedia(
  kind: ProfileMediaKind,
  mimeType: string,
  bytes: number,
): string | null {
  if (!ALLOWED_MEDIA_TYPES.has(mimeType)) return "Upload a JPEG, PNG, or WebP image.";
  if (!Number.isFinite(bytes) || bytes < 0) return "The image size is invalid.";

  const limitMiB = kind === "avatar" ? 5 : 10;
  const limitBytes = limitMiB * 1024 * 1024;
  if (bytes > limitBytes) return `${kind === "avatar" ? "Avatar" : "Banner"} images must be ${limitMiB} MiB or smaller.`;
  return null;
}
