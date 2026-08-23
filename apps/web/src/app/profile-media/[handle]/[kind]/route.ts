import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string; kind: string }> },
) {
  const { handle, kind } = await params;
  if (kind !== "avatar" && kind !== "banner") {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: objectPath }, { data: profileProjection }] = await Promise.all([
    supabase.rpc("resolve_profile_media", { profile_handle: handle, media_kind: kind }),
    supabase.rpc("get_public_profile", { profile_handle: handle }),
  ]);

  if (typeof objectPath !== "string" || !profileProjection || typeof profileProjection !== "object") {
    return new NextResponse(null, { status: 404 });
  }

  const { data: file, error } = await supabase.storage.from("profile-media").download(objectPath);
  if (error || !file) return new NextResponse(null, { status: 404 });

  const visibility = (profileProjection as Record<string, unknown>).visibility;
  const bytes = await file.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": visibility === "private" ? "private, no-store" : "public, max-age=60, s-maxage=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
