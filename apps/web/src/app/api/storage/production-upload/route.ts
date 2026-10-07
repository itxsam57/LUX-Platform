import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredStorageAdapter } from "@/lib/storage/runtime";

export const runtime = "nodejs";

function safeFileName(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-120);
  return cleaned || null;
}

export async function POST(request: Request) {
  await requireAdultViewer("/studio/projects");
  let input: Record<string,unknown>;
  try { input = await request.json() as Record<string,unknown>; } catch { return NextResponse.json({ error: "invalid_request" },{status:400}); }

  const projectPublicId = typeof input.projectPublicId === "string" && /^prj[0-9a-f]{24}$/.test(input.projectPublicId) ? input.projectPublicId : null;
  const fileName = safeFileName(input.fileName);
  const contentType = typeof input.contentType === "string" && input.contentType.length <= 160 ? input.contentType : "application/octet-stream";
  const contentLength = typeof input.contentLength === "number" && Number.isSafeInteger(input.contentLength) && input.contentLength > 0 && input.contentLength <= 5_000_000_000
    ? input.contentLength
    : null;
  if (!projectPublicId || !fileName || !contentLength) return NextResponse.json({ error: "invalid_upload" },{status:400});

  const supabase = await createServerSupabaseClient();
  const { error: authError } = await supabase.rpc("authorize_production_asset_upload", { requested_project_public_id: projectPublicId });
  if (authError) return NextResponse.json({ error: "upload_not_allowed" },{status:403});

  const objectPath = `${projectPublicId}/${randomUUID()}/${fileName}`;
  const adapter = getConfiguredStorageAdapter(supabase);
  if (!adapter.createUploadSession) return NextResponse.json({ error: "upload_provider_unavailable" },{status:503});

  try {
    const session = await adapter.createUploadSession({ bucket:"production-assets",objectPath,contentType,contentLength });
    return NextResponse.json(session,{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({ error: "upload_provider_unavailable" },{status:503});
  }
}
