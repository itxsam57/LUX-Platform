export type NavigationActionResult = {
  status: "success" | "error";
  message: string;
  destination: string;
};

export function navigationActionResult(
  status: NavigationActionResult["status"],
  message: string,
  destination: string,
): NavigationActionResult {
  return { status, message, destination };
}
