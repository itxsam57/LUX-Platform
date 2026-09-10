import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse(null, { status: 404 });
  const supabase = await createServerSupabaseClient();
  const { data: objectPath, error } = await supabase.rpc("resolve_release_asset_access", { requested_token: token });
  if (error || typeof objectPath !== "string") return new NextResponse(null, { status: 404 });
  const { data: file, error: downloadError } = await supabase.storage.from("production-assets").download(objectPath);
  if (downloadError || !file) return new NextResponse(null, { status: 404 });
  const bytes = await file.arrayBuffer();
  return new NextResponse(bytes, { status: 200, headers: { "Content-Type": file.type || "application/octet-stream", "Content-Length": String(bytes.byteLength), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
