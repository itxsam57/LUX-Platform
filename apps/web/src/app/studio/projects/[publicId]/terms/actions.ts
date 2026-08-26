"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const projectPattern=/^prj[0-9a-f]{24}$/;
function text(fd:FormData,key:string){const v=fd.get(key);return typeof v==="string"?v.trim():"";}
function csv(value:string){return value.split(",").map(v=>v.trim()).filter(Boolean);}
function path(id:string){return `/studio/projects/${id}/terms`;}

export async function publishTermsAction(fd:FormData):Promise<void>{
 await requireWorkspace("creator","project-terms-publish"); const id=text(fd,"project_public_id"); if(!projectPattern.test(id))redirect("/studio/projects");
 const revision=Number(text(fd,"project_revision")); const participants=text(fd,"participants").split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{const [handle,role,depicted]=line.split("|").map(v=>v.trim());return{handle:handle?.toLowerCase(),role:role?.toLowerCase(),depicted:depicted?.toLowerCase()==="true"};});
 const terms={participants,role:text(fd,"role").toLowerCase(),boundaries:csv(text(fd,"boundaries")),collaborators:csv(text(fd,"collaborators")).map(v=>v.toLowerCase()),compensation:text(fd,"compensation"),distributionScope:text(fd,"distribution_scope"),rightsScope:text(fd,"rights_scope"),schedule:text(fd,"schedule"),cancellation:text(fd,"cancellation"),finalCutApprovalRequired:text(fd,"final_cut")==="true"};
 const supabase=await createServerSupabaseClient(); const {error}=await supabase.rpc("publish_project_terms",{requested_project_public_id:id,expected_project_revision:revision,requested_terms:terms}); if(error)redirect(`${path(id)}?error=publish`); revalidatePath(path(id)); redirect(`${path(id)}?notice=published`);
}
export async function acceptTermsAction(fd:FormData):Promise<void>{await requireAdultViewer("/studio/projects");const id=text(fd,"project_public_id"),hash=text(fd,"terms_hash");if(!projectPattern.test(id))redirect("/studio/projects");const supabase=await createServerSupabaseClient();const{error}=await supabase.rpc("accept_project_terms",{requested_project_public_id:id,requested_terms_hash:hash,step_up_proof:text(fd,"step_up_proof")});if(error)redirect(`${path(id)}?error=accept`);revalidatePath(path(id));redirect(`${path(id)}?notice=accepted`);}
export async function recordConsentAction(fd:FormData):Promise<void>{await requireAdultViewer("/studio/projects");const id=text(fd,"project_public_id"),hash=text(fd,"terms_hash");if(!projectPattern.test(id))redirect("/studio/projects");const supabase=await createServerSupabaseClient();const{error}=await supabase.rpc("record_depicted_consent",{requested_project_public_id:id,requested_terms_hash:hash,step_up_proof:text(fd,"step_up_proof")});if(error)redirect(`${path(id)}?error=consent`);revalidatePath(path(id));redirect(`${path(id)}?notice=consented`);}
export async function lockContractAction(fd:FormData):Promise<void>{await requireWorkspace("creator","project-contract-lock");const id=text(fd,"project_public_id"),hash=text(fd,"terms_hash");if(!projectPattern.test(id))redirect("/studio/projects");const supabase=await createServerSupabaseClient();const{error}=await supabase.rpc("lock_project_contract",{requested_project_public_id:id,requested_terms_hash:hash});if(error)redirect(`${path(id)}?error=lock`);revalidatePath(path(id));revalidatePath(`/studio/projects/${id}`);redirect(`${path(id)}?notice=locked`);}
