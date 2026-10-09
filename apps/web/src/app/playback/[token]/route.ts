import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredStreamingAdapter } from "@/lib/streaming/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse(null, { status: 404 });

  const supabase = await createServerSupabaseClient();
  const { data: objectPath, error } = await supabase.rpc("resolve_release_playback", { requested_token: token });
  if (error || typeof objectPath !== "string") return new NextResponse(null, { status: 404 });

  const adapter = getConfiguredStreamingAdapter(supabase);
  let response: Response | null;
  try {
    response = await adapter.stream({
      bucket: "production-assets",
      objectPath,
      rangeHeader: request.headers.get("range"),
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!response) return new NextResponse(null, { status: 404 });

  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new NextResponse(response.body, { status: response.status, headers });
}
