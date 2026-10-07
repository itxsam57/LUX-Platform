import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderBridgeConfig } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";
import { createSupabaseStorageAdapter } from "../storage/adapter";

export type StreamRequest = {
  bucket: string;
  objectPath: string;
  rangeHeader: string | null;
};

export interface StreamingAdapter {
  readonly providerKey: string;
  stream(input: StreamRequest): Promise<Response | null>;
}

function rangeSlice(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return "invalid" as const;
  const startRaw = match[1], endRaw = match[2];
  if (!startRaw && !endRaw) return "invalid" as const;
  let start: number;
  let end: number;
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid" as const;
    start = Math.max(0,size-suffix); end = size-1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size-1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return "invalid" as const;
  end = Math.min(end,size-1);
  return { start,end };
}

export function createSupabaseStreamingAdapter(supabase: SupabaseClient): StreamingAdapter {
  const storage = createSupabaseStorageAdapter(supabase);
  return {
    providerKey: "supabase",
    async stream(input) {
      const object = await storage.download(input);
      if (!object) return null;
      const range = rangeSlice(input.rangeHeader,object.size);
      if (range === "invalid") {
        return new Response(null,{status:416,headers:{"Content-Range":`bytes */${object.size}`,"Accept-Ranges":"bytes"}});
      }
      if (!range) {
        return new Response(object.body,{status:200,headers:{"Content-Type":object.contentType,"Content-Length":String(object.size),"Accept-Ranges":"bytes"}});
      }
      const body = object.body.slice(range.start,range.end+1);
      return new Response(body,{status:206,headers:{
        "Content-Type":object.contentType,
        "Content-Length":String(body.byteLength),
        "Content-Range":`bytes ${range.start}-${range.end}/${object.size}`,
        "Accept-Ranges":"bytes",
      }});
    },
  };
}

export function createBridgeStreamingAdapter(config: ProviderBridgeConfig, fetchImpl: typeof fetch = fetch): StreamingAdapter {
  const client = createProviderBridgeClient(config,fetchImpl);
  return {
    providerKey: config.providerKey,
    async stream(input) {
      const result = await client.request<{ streamUrl?: unknown }>("/v1/streaming/session", {
        body: { bucket: input.bucket, objectPath: input.objectPath },
      });
      const streamUrl = typeof result.streamUrl === "string" ? result.streamUrl : null;
      if (!streamUrl) throw new Error("invalid_streaming_session");
      const parsed = new URL(streamUrl);
      if (parsed.protocol !== "https:") throw new Error("invalid_streaming_session");
      const response = await fetchImpl(parsed,{headers:input.rangeHeader?{range:input.rangeHeader}:{},cache:"no-store",redirect:"error"});
      if (!response.ok && response.status !== 206) return response.status === 416 ? response : null;
      const headers = new Headers(response.headers);
      headers.set("Cache-Control","private, no-store");
      headers.set("X-Content-Type-Options","nosniff");
      return new Response(response.body,{status:response.status,headers});
    },
  };
}
