import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredStorageAdapter } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string; kind: string }> },
) {
  const { handle, kind } = await params;
  if (kind !== "avatar" && kind !== "banner") return new NextResponse(null, { status: 404 });

  const supabase = await createServerSupabaseClient();
  const [{ data: objectPath }, { data: profileProjection }] = await Promise.all([
    supabase.rpc("resolve_profile_media", { profile_handle: handle, media_kind: kind }),
    supabase.rpc("get_public_profile", { profile_handle: handle }),
  ]);

  if (typeof objectPath !== "string" || !profileProjection || typeof profileProjection !== "object") {
    return new NextResponse(null, { status: 404 });
  }

  let object;
  try {
    object = await getConfiguredStorageAdapter(supabase).download({ bucket: "profile-media", objectPath });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!object) return new NextResponse(null, { status: 404 });

  const visibility = (profileProjection as Record<string, unknown>).visibility;
  return new NextResponse(object.body, {
    status: 200,
    headers: {
      "Content-Type": object.contentType || "image/webp",
      "Content-Length": String(object.size),
      "Cache-Control": visibility === "private" ? "private, no-store" : "public, max-age=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
