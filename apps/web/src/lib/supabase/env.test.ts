import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAgeAssuranceProviderRuntime,
  getPaymentProviderRuntime,
  getPayoutProviderRuntime,
  getVerificationProviderRuntime,
} from "./env";

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
  vi.stubEnv("IDENTITY_VERIFICATION_PROVIDER_BASE_URL", "");
  vi.stubEnv("IDENTITY_VERIFICATION_PROVIDER_API_KEY", "");
  vi.stubEnv("IDENTITY_VERIFICATION_PROVIDER_WEBHOOK_SECRET", "");
}

function configureSandboxPaymentOverride({
  ci,
  appUrl,
}: {
  ci: string;
  appUrl: string;
}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CI", ci);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
  vi.stubEnv("PAYMENT_ENVIRONMENT", "test");
  vi.stubEnv("PAYMENT_MODE", "sandbox");
  vi.stubEnv("PAYMENT_PROVIDER", "");
  vi.stubEnv("PAYMENT_PROVIDER_BASE_URL", "");
  vi.stubEnv("PAYMENT_PROVIDER_API_KEY", "");
  vi.stubEnv("PAYMENT_PROVIDER_WEBHOOK_SECRET", "");
}

function configureBridge(prefix: "PAYMENT" | "PAYOUT" | "IDENTITY_VERIFICATION" | "AGE_ASSURANCE") {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  vi.stubEnv(`${prefix}_PROVIDER`, "provider_one");
  vi.stubEnv(`${prefix}_PROVIDER_BASE_URL`, "https://bridge.example");
  vi.stubEnv(`${prefix}_PROVIDER_API_KEY`, "api-key-123");
  vi.stubEnv(`${prefix}_PROVIDER_WEBHOOK_SECRET`, "webhook-secret-123");
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

  it("requires the full production identity bridge configuration, not only a provider name", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lux.example");
    vi.stubEnv("IDENTITY_VERIFICATION_PROVIDER", "provider_one");
    expect(getVerificationProviderRuntime().mode).toBe("unavailable");

    configureBridge("IDENTITY_VERIFICATION");
    expect(getVerificationProviderRuntime()).toEqual({
      environment: "production",
      mode: "provider",
      providerKey: "provider_one",
    });
  });
});

describe("payment provider runtime environment", () => {
  it("permits the explicit sandbox test runtime only for CI on a loopback app URL", () => {
    configureSandboxPaymentOverride({ ci: "true", appUrl: "http://127.0.0.1:30002" });
    expect(getPaymentProviderRuntime()).toEqual({ environment: "test", mode: "sandbox", providerKey: null });
  });

  it("keeps a production URL fail-closed even when sandbox mode is requested", () => {
    configureSandboxPaymentOverride({ ci: "true", appUrl: "https://lux.example" });
    expect(getPaymentProviderRuntime()).toEqual({ environment: "production", mode: "unavailable", providerKey: null });
  });

  it("requires the full production payment bridge configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "provider_one");
    expect(getPaymentProviderRuntime().mode).toBe("unavailable");

    configureBridge("PAYMENT");
    expect(getPaymentProviderRuntime()).toEqual({
      environment: "production",
      mode: "provider",
      providerKey: "provider_one",
    });

    vi.stubEnv("PAYMENT_PROVIDER_BASE_URL", "http://gateway.example");
    expect(getPaymentProviderRuntime().mode).toBe("unavailable");
  });
});

describe("payout provider runtime environment", () => {
  it("fails closed until all payout bridge settings are present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYOUT_PROVIDER", "provider_one");
    expect(getPayoutProviderRuntime().mode).toBe("unavailable");

    configureBridge("PAYOUT");
    expect(getPayoutProviderRuntime()).toEqual({
      environment: "production",
      mode: "provider",
      providerKey: "provider_one",
    });
  });
});

describe("age assurance provider runtime environment", () => {
  it("requires provider-required mode plus the full age bridge configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AGE_ASSURANCE_MODE", "self_attestation");
    configureBridge("AGE_ASSURANCE");
    expect(getAgeAssuranceProviderRuntime().mode).toBe("unavailable");

    vi.stubEnv("AGE_ASSURANCE_MODE", "provider_required");
    expect(getAgeAssuranceProviderRuntime()).toEqual({
      environment: "production",
      mode: "provider",
      providerKey: "provider_one",
    });
  });
});
