export const FOUNDATION_SLICE = {
  id: "slice-1",
  number: 1,
  name: "Design system and application shell",
  healthStatus: "ok",
  requiredRoutes: ["/", "/design-system", "/health"] as const,
} as const;

export function isFoundationRoute(pathname: string): boolean {
  return FOUNDATION_SLICE.requiredRoutes.includes(
    pathname as (typeof FOUNDATION_SLICE.requiredRoutes)[number],
  );
}
