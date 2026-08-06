export const FOUNDATION_SLICE = {
  id: "slice-2",
  number: 2,
  name: "Authentication, age assurance, and workspace isolation",
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
  ] as const,
} as const;

export function isFoundationRoute(pathname: string): boolean {
  return FOUNDATION_SLICE.requiredRoutes.includes(
    pathname as (typeof FOUNDATION_SLICE.requiredRoutes)[number],
  );
}
