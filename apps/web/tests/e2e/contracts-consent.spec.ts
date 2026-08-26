import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error("Slice 8 E2E requires isolated Supabase service configuration");
const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}), PASSWORD="LuxSecureTest123";
function email(prefix:string,t:TestInfo){return `${prefix}-${t.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;}
async function user(address:string){const {data,error}=await admin.auth.admin.createUser({email:address,password:PASSWORD,email_confirm:true});if(error||!data.user)throw error;return data.user;}
async function login(page:Page,address:string,target:string){await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);await page.getByLabel("Email address").fill(address);await page.getByLabel("Password").fill(PASSWORD);await page.getByRole("button",{name:"Sign in"}).click();if(new URL(page.url()).pathname==="/age-assurance"){await page.getByLabel("Country code").fill("PK");await page.getByLabel(/I confirm that I am at least 18 years old/).check();await page.getByRole("button",{name:"Confirm and continue"}).click();}}

test("exact terms require personal verified acceptance and consent before creator lock",async({page},testInfo)=>{
 const ownerEmail=email("s8-owner",testInfo), performerEmail=email("s8-performer",testInfo); const owner=await user(ownerEmail), performer=await user(performerEmail);
 const projectPublicId=`prj${"8".repeat(24)}`, termsHash="a".repeat(64), projectId=crypto.randomUUID(), termId=crypto.randomUUID();
 try{
  await admin.from("profiles").update({handle:`s8o_${owner.id.slice(0,8)}`,display_name:"S8 Owner",visibility:"public"}).eq("user_id",owner.id);
  const performerHandle=`s8p_${performer.id.slice(0,8)}`;
  await admin.from("profiles").update({handle:performerHandle,display_name:"S8 Performer",visibility:"public"}).eq("user_id",performer.id);
  for(const id of [owner.id,performer.id]) await admin.from("age_assurance_records").insert({user_id:id,method:"self_attestation",status:"accepted",jurisdiction_code:"PK",policy_version:"s8-e2e",expires_at:new Date(Date.now()+86400000).toISOString()});
  const {data:creatorMembership,error:membershipError}=await admin.from("workspace_memberships").insert({user_id:owner.id,role:"creator",status:"approved",reviewed_at:new Date().toISOString(),reviewed_by:owner.id}).select("id").single(); if(membershipError)throw membershipError;
  await admin.from("active_workspaces").update({membership_id:creatorMembership.id}).eq("user_id",owner.id);
  await admin.from("verification_subjects").insert([{user_id:performer.id,level:"v2",status:"verified",verified_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()},{user_id:performer.id,level:"v3",status:"verified",verified_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()}]);
  await admin.from("projects").insert({id:projectId,public_id:projectPublicId,owner_user_id:owner.id,current_revision:1,state:"draft"});
  await admin.from("project_versions").insert({project_id:projectId,revision:1,title:"Exact consent project",public_synopsis:"A public synopsis for an exact personal consent browser flow.",private_brief:"A private production brief for the exact personal consent browser flow and participant review.",category:"concept",format:"video",boundaries:["closed-set"],compensation_model:"fixed",distribution_scope:"platform-only",rights_declarations:["original-concept"],created_by_user_id:owner.id});
  await admin.from("project_term_versions").insert({id:termId,project_id:projectId,version:1,project_revision:1,terms:{participants:[{handle:performerHandle,role:"performer",depicted:true}],role:"performer",boundaries:["closed-set"],collaborators:[`s8o_${owner.id.slice(0,8)}`],compensation:"fixed:10000:USD",distributionScope:"platform-only",rightsScope:"streaming-only",schedule:"September window",cancellation:"Either party may leave before contract lock",finalCutApprovalRequired:true},terms_hash:termsHash,created_by_user_id:owner.id});
  await login(page,performerEmail,`/studio/projects/${projectPublicId}/terms`);
  await page.goto(`/studio/projects/${projectPublicId}/terms`); await expect(page.getByRole("heading",{name:"Contract terms and consent"})).toBeVisible(); await expect(page.getByText(termsHash)).toBeVisible(); await expect(page.getByText(/agency cannot consent for you/i)).toBeVisible();
  await page.getByLabel("Step-up confirmation").fill("step-up-confirmed"); await page.getByRole("button",{name:"Accept exact terms"}).click(); await expect(page.getByText("Terms accepted personally.")).toBeVisible();
  await page.getByLabel("Consent step-up confirmation").fill("step-up-confirmed"); await page.getByRole("button",{name:"Record depicted-person consent"}).click(); await expect(page.getByText("Depicted-person consent recorded personally.")).toBeVisible();
  await page.getByRole("button",{name:"Sign out"}).click(); await login(page,ownerEmail,`/studio/projects/${projectPublicId}/terms`); await page.goto(`/studio/projects/${projectPublicId}/terms`); await page.getByRole("button",{name:"Lock contract"}).click(); await expect(page.getByText("Contract locked")).toBeVisible(); await page.reload(); await expect(page.getByText("Contract locked")).toBeVisible();
 }finally{await admin.auth.admin.deleteUser(owner.id);await admin.auth.admin.deleteUser(performer.id);}
});
