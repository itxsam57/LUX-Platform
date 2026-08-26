import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Slice 8 E2E requires isolated Supabase service configuration");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = "LuxSecureTest123";
const RESULT_EXPIRY = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Slice 8 test user unavailable");
  return data.user;
}

async function authenticatedClient(address: string): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function assureAdult(client: SupabaseClient) {
  const { error } = await client.rpc("confirm_adult_attestation", {
    jurisdiction_code: "PK",
    policy_version: "s8-e2e",
  });
  if (error) throw error;
}

async function configureCreator(ownerEmail: string, ownerId: string, testInfo: TestInfo) {
  const ownerClient = await authenticatedClient(ownerEmail);
  await assureAdult(ownerClient);
  const { data: membershipId, error: requestError } = await ownerClient.rpc("request_workspace_role", {
    requested_role: "creator",
  });
  if (requestError || typeof membershipId !== "string") {
    throw requestError ?? new Error("Creator membership request was not created");
  }

  const adminEmail = email("s8-admin", testInfo);
  const superAdmin = await createUser(adminEmail);
  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", {
      target_user_id: superAdmin.id,
    });
    if (bootstrapError) throw bootstrapError;
    const reviewer = await authenticatedClient(adminEmail);
    const { error: reviewError } = await reviewer.rpc("review_workspace_request", {
      target_membership_id: membershipId,
      decision: "approved",
    });
    if (reviewError) throw reviewError;
  } finally {
    await admin.auth.admin.deleteUser(superAdmin.id);
  }

  const { error: activateError } = await ownerClient.rpc("activate_workspace", {
    target_membership_id: membershipId,
  });
  if (activateError) throw activateError;
  const { data: context, error: contextError } = await ownerClient.rpc("get_viewer_context");
  if (contextError || context?.active_role !== "creator") {
    throw contextError ?? new Error(`Creator workspace was not active for ${ownerId}`);
  }
  return ownerClient;
}

async function verifyPerformer(performerEmail: string, performerId: string, testInfo: TestInfo) {
  const performer = await authenticatedClient(performerEmail);
  await assureAdult(performer);

  const adminEmail = email("s8-verification-admin", testInfo);
  const superAdmin = await createUser(adminEmail);
  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", {
      target_user_id: superAdmin.id,
    });
    if (bootstrapError) throw bootstrapError;
    const reviewer = await authenticatedClient(adminEmail);

    const { data: v2Session, error: v2StartError } = await performer.rpc("start_verification", {
      requested_level: "v2",
      requested_provider_key: "synthetic",
      requested_provider_reference: `s8-v2:${performerId}`,
      requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requested_synthetic: true,
    });
    if (v2StartError || typeof v2Session !== "string") throw v2StartError ?? new Error("V2 session unavailable");
    const { error: v2ReviewError } = await reviewer.rpc("apply_verification_result", {
      target_session_id: v2Session,
      decision: "verified",
      requested_result_expires_at: RESULT_EXPIRY(),
      requested_liveness_passed: true,
      requested_risk_screen_passed: true,
      requested_recheck_reason: null,
    });
    if (v2ReviewError) throw v2ReviewError;

    const { error: educationError } = await performer.rpc("acknowledge_consent_education", {
      requested_policy_version: "slice-5-consent-v1",
    });
    if (educationError) throw educationError;
    const { error: prerequisiteError } = await reviewer.rpc("set_performer_verification_prerequisites", {
      target_user_id: performerId,
      record_active: true,
      liveness_expires_at: RESULT_EXPIRY(),
      payout_ownership_verified: true,
    });
    if (prerequisiteError) throw prerequisiteError;

    const { data: v3Session, error: v3StartError } = await performer.rpc("start_verification", {
      requested_level: "v3",
      requested_provider_key: "synthetic",
      requested_provider_reference: `s8-v3:${performerId}`,
      requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requested_synthetic: true,
    });
    if (v3StartError || typeof v3Session !== "string") throw v3StartError ?? new Error("V3 session unavailable");
    const { error: v3ReviewError } = await reviewer.rpc("apply_verification_result", {
      target_session_id: v3Session,
      decision: "verified",
      requested_result_expires_at: RESULT_EXPIRY(),
      requested_liveness_passed: true,
      requested_risk_screen_passed: true,
      requested_recheck_reason: null,
    });
    if (v3ReviewError) throw v3ReviewError;
  } finally {
    await admin.auth.admin.deleteUser(superAdmin.id);
  }

  return performer;
}

async function login(page: Page, address: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`${escapedTarget}$`));
}

test("exact terms require personal verified acceptance and consent before creator lock", async ({ page }, testInfo) => {
  const ownerEmail = email("s8-owner", testInfo);
  const performerEmail = email("s8-performer", testInfo);
  const owner = await createUser(ownerEmail);
  const performer = await createUser(performerEmail);

  try {
    const ownerClient = await configureCreator(ownerEmail, owner.id, testInfo);
    const performerClient = await verifyPerformer(performerEmail, performer.id, testInfo);
    const { data: performerProfile, error: profileError } = await performerClient
      .from("profiles")
      .select("handle")
      .eq("user_id", performer.id)
      .single();
    if (profileError || !performerProfile?.handle) throw profileError ?? new Error("Performer handle unavailable");

    const { data: projectResult, error: projectError } = await ownerClient.rpc("create_project_draft", {
      project_input: {
        title: "Exact consent project",
        publicSynopsis: "A public synopsis for an exact personal consent browser flow.",
        privateBrief: "A private production brief for the exact personal consent browser flow and participant review.",
        category: "concept",
        format: "video",
        boundaries: ["closed-set"],
        compensationModel: "fixed",
        distributionScope: "platform-only",
        rightsDeclarations: ["original-concept"],
      },
    });
    if (projectError || !projectResult?.publicId) throw projectError ?? new Error("Project fixture unavailable");
    const projectPublicId = String(projectResult.publicId);

    const { data: termsResult, error: termsError } = await ownerClient.rpc("publish_project_terms", {
      requested_project_public_id: projectPublicId,
      expected_project_revision: 1,
      requested_terms: {
        participants: [{ handle: performerProfile.handle, role: "performer", depicted: true }],
        role: "performer",
        boundaries: ["closed-set"],
        collaborators: ["owner"],
        compensation: "fixed:10000:USD",
        distributionScope: "platform-only",
        rightsScope: "streaming-only",
        schedule: "September window",
        cancellation: "Either party may leave before contract lock",
        finalCutApprovalRequired: true,
      },
    });
    if (termsError || !termsResult?.hash) throw termsError ?? new Error("Terms fixture unavailable");
    const termsHash = String(termsResult.hash);

    await login(page, performerEmail, `/studio/projects/${projectPublicId}/terms`);
    await expect(page.getByRole("heading", { name: "Contract terms and consent" })).toBeVisible();
    await expect(page.getByText(termsHash)).toBeVisible();
    await expect(page.getByText(/agency cannot consent for you/i)).toBeVisible();
    await page.getByLabel("Step-up confirmation").fill("step-up-confirmed");
    await page.getByRole("button", { name: "Accept exact terms" }).click();
    await expect(page.getByRole("status")).toContainText("Terms accepted personally.", { timeout: 10_000 });
    await page.getByLabel("Consent step-up confirmation").fill("step-up-confirmed");
    await page.getByRole("button", { name: "Record depicted-person consent" }).click();
    await expect(page.getByRole("status")).toContainText("Depicted-person consent recorded personally.", { timeout: 10_000 });

    await page.getByRole("button", { name: "Sign out" }).click();
    await login(page, ownerEmail, `/studio/projects/${projectPublicId}/terms`);
    await page.getByRole("button", { name: "Lock contract" }).click();
    await expect(page.getByText("Contract locked")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Contract locked")).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(owner.id);
    await admin.auth.admin.deleteUser(performer.id);
  }
});
