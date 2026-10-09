import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderBridgeConfig } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";

export type StorageObjectRequest = {
  bucket: string;
  objectPath: string;
};

export type StoredObject = {
  body: ArrayBuffer;
  contentType: string;
  size: number;
};

export type UploadSession = {
  providerKey: string;
  objectPath: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string,string>;
  expiresAt: string;
  protocol: "supabase_signed" | "put";
  token?: string;
};

export interface ObjectStorageAdapter {
  readonly providerKey: string;
  download(input: StorageObjectRequest): Promise<StoredObject | null>;
  createUploadSession?(input: StorageObjectRequest & { contentType: string; contentLength: number }): Promise<UploadSession>;
  remove?(input: StorageObjectRequest): Promise<boolean>;
}

function safePath(value: string) {
  if (!value || value.length > 1024 || value.startsWith("/") || value.includes("..") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("invalid_storage_path");
  }
  return value;
}

function safeBucket(value: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(value)) throw new Error("invalid_storage_bucket");
  return value;
}

export function createSupabaseStorageAdapter(supabase: SupabaseClient): ObjectStorageAdapter {
  return {
    providerKey: "supabase",
    async download(input) {
      const bucket = safeBucket(input.bucket), objectPath = safePath(input.objectPath);
      const { data, error } = await supabase.storage.from(bucket).download(objectPath);
      if (error || !data) return null;
      const body = await data.arrayBuffer();
      return { body, contentType: data.type || "application/octet-stream", size: body.byteLength };
    },
    async createUploadSession(input) {
      const bucket = safeBucket(input.bucket), objectPath = safePath(input.objectPath);
      if (!Number.isSafeInteger(input.contentLength) || input.contentLength < 1 || input.contentLength > 5_000_000_000) throw new Error("invalid_storage_upload_size");
      const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath, { upsert: false });
      if (error || !data?.signedUrl || !data.token) throw new Error("storage_upload_session_failed");
      return {
        providerKey: "supabase",
        objectPath,
        uploadUrl: data.signedUrl,
        method: "PUT",
        headers: {},
        expiresAt: new Date(Date.now()+2*60*60*1000).toISOString(),
        protocol: "supabase_signed",
        token: data.token,
      };
    },
    async remove(input) {
      const { error } = await supabase.storage.from(safeBucket(input.bucket)).remove([safePath(input.objectPath)]);
      return !error;
    },
  };
}

type BridgeDownload = { downloadUrl?: unknown; expiresAt?: unknown };
type BridgeUpload = { uploadUrl?: unknown; expiresAt?: unknown; headers?: unknown };

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

export function createBridgeStorageAdapter(config: ProviderBridgeConfig, fetchImpl: typeof fetch = fetch): ObjectStorageAdapter {
  const client = createProviderBridgeClient(config, fetchImpl);
  return {
    providerKey: config.providerKey,
    async download(input) {
      const bucket = safeBucket(input.bucket), objectPath = safePath(input.objectPath);
      const response = await client.request<BridgeDownload>("/v1/storage/download", { body: { bucket, objectPath } });
      const downloadUrl = httpsUrl(response.downloadUrl);
      if (!downloadUrl) throw new Error("invalid_storage_download_response");
      const upstream = await fetchImpl(downloadUrl, { cache: "no-store", redirect: "error" });
      if (!upstream.ok) return null;
      const body = await upstream.arrayBuffer();
      return { body, contentType: upstream.headers.get("content-type") || "application/octet-stream", size: body.byteLength };
    },
    async createUploadSession(input) {
      const bucket = safeBucket(input.bucket), objectPath = safePath(input.objectPath);
      if (!Number.isSafeInteger(input.contentLength) || input.contentLength < 1 || input.contentLength > 5_000_000_000) throw new Error("invalid_storage_upload_size");
      const response = await client.request<BridgeUpload>("/v1/storage/upload", {
        body: { bucket, objectPath, contentType: input.contentType, contentLength: input.contentLength },
      });
      const uploadUrl = httpsUrl(response.uploadUrl);
      const expiresAt = typeof response.expiresAt === "string" && !Number.isNaN(Date.parse(response.expiresAt)) ? response.expiresAt : null;
      const headers = response.headers && typeof response.headers === "object" && !Array.isArray(response.headers)
        ? Object.fromEntries(Object.entries(response.headers as Record<string,unknown>).filter((entry): entry is [string,string] => typeof entry[1] === "string"))
        : {};
      if (!uploadUrl || !expiresAt) throw new Error("invalid_storage_upload_response");
      return { providerKey: config.providerKey, objectPath, uploadUrl, method: "PUT", headers, expiresAt, protocol: "put" };
    },
    async remove(input) {
      const bucket = safeBucket(input.bucket), objectPath = safePath(input.objectPath);
      await client.request("/v1/storage/delete", { body: { bucket, objectPath } });
      return true;
    },
  };
}
