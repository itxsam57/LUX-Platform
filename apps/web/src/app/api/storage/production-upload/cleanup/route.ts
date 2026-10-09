import { NextResponse } from "next/server";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredStorageAdapter } from "@/lib/storage/runtime";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  await requireAdultViewer("/studio/projects");
  let input: Record<string,unknown>;
  try { input = await request.json() as Record<string,unknown>; } catch { return NextResponse.json({ error:"invalid_request" },{status:400}); }
  const projectPublicId = typeof input.projectPublicId === "string" && /^prj[0-9a-f]{24}$/.test(input.projectPublicId) ? input.projectPublicId : null;
  const objectPath = typeof input.objectPath === "string" && input.objectPath.startsWith(`${projectPublicId ?? "invalid"}/`) && !input.objectPath.includes("..") ? input.objectPath : null;
  if (!projectPublicId || !objectPath) return NextResponse.json({ error:"invalid_cleanup" },{status:400});

  const supabase = await createServerSupabaseClient();
  const { error: authError } = await supabase.rpc("authorize_production_asset_upload",{requested_project_public_id:projectPublicId});
  if (authError) return NextResponse.json({ error:"cleanup_not_allowed" },{status:403});

  const adapter = getConfiguredStorageAdapter(supabase);
  if (!adapter.remove) return NextResponse.json({ ok:false },{status:503});
  try {
    return NextResponse.json({ ok:await adapter.remove({bucket:"production-assets",objectPath}) });
  } catch {
    return NextResponse.json({ ok:false },{status:502});
  }
}
