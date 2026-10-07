import { describe, expect, it, vi } from "vitest";
import { createSupabaseStorageAdapter } from "./adapter";
import { createSupabaseStreamingAdapter } from "../streaming/adapter";

function fakeSupabase(bytes = new Uint8Array([1,2,3,4,5])) {
  const fileLike = {
    type: "video/mp4",
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
  return {
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({ data: fileLike, error: null })),
        remove: vi.fn(async () => ({ error: null })),
        createSignedUploadUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.example/upload", token: "token", path: "path" }, error: null })),
      })),
    },
  } as never;
}

describe("storage and streaming adapters", () => {
  it("downloads through the storage boundary", async () => {
    const adapter = createSupabaseStorageAdapter(fakeSupabase());
    await expect(adapter.download({ bucket: "production-assets", objectPath: "prj/file.mp4" })).resolves.toMatchObject({ size: 5, contentType: "video/mp4" });
  });

  it("serves byte ranges through the streaming boundary", async () => {
    const adapter = createSupabaseStreamingAdapter(fakeSupabase());
    const response = await adapter.stream({ bucket: "production-assets", objectPath: "prj/file.mp4", rangeHeader: "bytes=1-3" });
    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 1-3/5");
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual([2,3,4]);
  });
});
