import { afterEach, describe, expect, it, vi } from "vitest";
import { getVerificationProviderRuntime } from "./env";

function configureSyntheticTestOverride({
  ci,
  appUrl,
}: {
  ci: string;
  appUrl: string;
}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CI", ci);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
  vi.stubEnv("IDENTITY_VERIFICATION_ENVIRONMENT", "test");
  vi.stubEnv("IDENTITY_VERIFICATION_MODE", "synthetic");
  vi.stubEnv("IDENTITY_VERIFICATION_PROVIDER", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verification provider runtime environment", () => {
  it("permits the explicit synthetic test runtime only for CI on a loopback app URL", () => {
    configureSyntheticTestOverride({
      ci: "true",
      appUrl: "http://127.0.0.1:30002",
    });

    expect(getVerificationProviderRuntime()).toEqual({
      environment: "test",
      mode: "synthetic",
      providerKey: null,
    });
  });

  it("keeps a production URL fail-closed even when a test override is requested", () => {
    configureSyntheticTestOverride({
      ci: "true",
      appUrl: "https://lux.example",
    });

    expect(getVerificationProviderRuntime()).toEqual({
      environment: "production",
      mode: "unavailable",
      providerKey: null,
    });
  });

  it("keeps non-CI production fail-closed even on a loopback URL", () => {
    configureSyntheticTestOverride({
      ci: "false",
      appUrl: "http://127.0.0.1:30002",
    });

    expect(getVerificationProviderRuntime()).toEqual({
      environment: "production",
      mode: "unavailable",
      providerKey: null,
    });
  });
});
