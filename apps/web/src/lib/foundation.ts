export const FOUNDATION_SLICE = {
  id: "slice-3",
  number: 3,
  name: "Profiles and privacy",
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
    "/notifications",
  ] as const,
} as const;

export function isFoundationRoute(pathname: string): boolean {
  return FOUNDATION_SLICE.requiredRoutes.includes(
    pathname as (typeof FOUNDATION_SLICE.requiredRoutes)[number],
  );
}
