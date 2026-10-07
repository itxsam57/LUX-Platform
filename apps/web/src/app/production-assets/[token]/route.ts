import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredStorageAdapter } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse(null, { status: 404 });

  const supabase = await createServerSupabaseClient();
  const { data: objectPath, error } = await supabase.rpc("resolve_production_asset_access", { requested_token: token });
  if (error || typeof objectPath !== "string") return new NextResponse(null, { status: 404 });

  let object;
  try {
    object = await getConfiguredStorageAdapter(supabase).download({ bucket: "production-assets", objectPath });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!object) return new NextResponse(null, { status: 404 });

  const fileName = objectPath.split("/").pop()?.replace(/[^A-Za-z0-9._-]/g, "-") || "production-asset.bin";
  return new NextResponse(object.body, {
    status: 200,
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
