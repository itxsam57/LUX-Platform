export const FOUNDATION_SLICE = {
  id: "slice-5",
  number: 5,
  name: "Creator and depicted-person verification",
  healthStatus: "ok",
  requiredRoutes: [
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
    "/settings/profile",
    "/settings/privacy",
    "/settings/privacy/export",
    "/settings/verification",
    "/notifications",
    "/app/feed",
    "/app/explore",
    "/app/search",
    "/workspace/staff/verification",
  ] as const,
} as const;

export function isFoundationRoute(pathname: string): boolean {
  return FOUNDATION_SLICE.requiredRoutes.includes(
    pathname as (typeof FOUNDATION_SLICE.requiredRoutes)[number],
  );
}
