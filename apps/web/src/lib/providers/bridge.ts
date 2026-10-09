export type ProviderBridgeConfig = {
  providerKey: string;
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  webhookSignatureHeader: string;
  timeoutMs?: number;
};

export type ProviderBridgeHealth = {
  providerKey: string;
  providerLabel: string;
  configured: boolean;
  healthy: boolean;
};

export type ProviderBridgeRequest = {
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
};

export type ProviderFetch = typeof fetch;

const PROVIDER_KEY = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,80}$/;

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function normalizeProviderBridgeConfig(
  input: ProviderBridgeConfig,
  environment: "development" | "test" | "production",
): ProviderBridgeConfig {
  const providerKey = input.providerKey.trim().toLowerCase();
  const providerLabel = input.providerLabel.trim();
  const apiKey = input.apiKey.trim();
  const webhookSecret = input.webhookSecret.trim();
  const webhookSignatureHeader = input.webhookSignatureHeader.trim().toLowerCase();
  const timeoutMs = input.timeoutMs ?? 10_000;

  if (!PROVIDER_KEY.test(providerKey)) throw new Error("Invalid provider key.");
  if (providerLabel.length < 2 || providerLabel.length > 120) throw new Error("Invalid provider label.");
  if (apiKey.length < 8 || apiKey.length > 4096) throw new Error("Invalid provider API credential.");
  if (webhookSecret.length < 8 || webhookSecret.length > 4096) throw new Error("Invalid provider webhook secret.");
  if (!HEADER_NAME.test(webhookSignatureHeader)) throw new Error("Invalid provider webhook signature header.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) throw new Error("Invalid provider timeout.");

  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error("Invalid provider bridge URL.");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("Provider bridge URL must not contain credentials, query, or fragment.");
  if (environment === "production" && url.protocol !== "https:") throw new Error("Production provider bridge must use HTTPS.");
  if (environment !== "production" && url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new Error("Non-production provider bridge must use HTTPS or loopback HTTP.");
  }

  return {
    providerKey,
    providerLabel,
    baseUrl: url.toString().replace(/\/$/, ""),
    apiKey,
    webhookSecret,
    webhookSignatureHeader,
    timeoutMs,
  };
}

export function createProviderBridgeClient(
  config: ProviderBridgeConfig,
  fetchImpl: ProviderFetch = fetch,
) {
  const timeoutMs = config.timeoutMs ?? 10_000;

  async function request<T>(path: string, input: ProviderBridgeRequest = {}): Promise<T> {
    if (!/^\/v1\/[A-Za-z0-9/_-]+$/.test(path)) throw new Error("Invalid provider bridge path.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: input.method ?? (input.body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          accept: "application/json",
          ...(input.body === undefined ? {} : { "content-type": "application/json" }),
          ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Provider bridge request failed with status ${response.status}.`);
      }
      const value = await response.json() as T;
      return value;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Provider bridge request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { request };
}

export function providerWebhookSignature(
  headers: Headers,
  signatureHeader: string,
): string | null {
  const value = headers.get(signatureHeader);
  return value?.trim() || null;
}
