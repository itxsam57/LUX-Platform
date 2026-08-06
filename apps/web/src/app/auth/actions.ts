"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  INITIAL_AUTH_STATE,
  normalizeEmail,
  normalizeNextPath,
  validateEmail,
  validatePassword,
  type AuthActionState,
} from "@/lib/auth/policy";
import { getPublicAppUrl } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function passwordFrom(formData: FormData): string {
  const value = formData.get("password");
  return typeof value === "string" ? value : "";
}

export async function signUpAction(
  previous: AuthActionState = INITIAL_AUTH_STATE,
  formData: FormData,
): Promise<AuthActionState> {
  void previous;
  const email = normalizeEmail(formData.get("email"));
  const password = passwordFrom(formData);
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password, email);

  if (emailError || passwordError) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        email: emailError ?? undefined,
        password: passwordError ?? undefined,
      },
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getPublicAppUrl()}/auth/callback?next=/age-assurance`,
      },
    });

    if (error) {
      return {
        status: "error",
        message: "Registration could not be completed. Check the details or try again later.",
      };
    }
  } catch {
    return { status: "error", message: "Authentication is not configured for this environment." };
  }

  return {
    status: "success",
    message: "Check your email for the verification link. The message is the same whether an address already exists.",
  };
}

export async function loginAction(
  previous: AuthActionState = INITIAL_AUTH_STATE,
  formData: FormData,
): Promise<AuthActionState> {
  void previous;
  const email = normalizeEmail(formData.get("email"));
  const password = passwordFrom(formData);
  const nextPath = normalizeNextPath(formData.get("next"));
  const emailError = validateEmail(email);

  if (emailError || !password) {
    return {
      status: "error",
      message: "Enter a valid email and password.",
      fieldErrors: { email: emailError ?? undefined },
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { status: "error", message: "The email or password is incorrect, or the email is not verified." };
    }

    await supabase.rpc("record_auth_event", {
      auth_event_type: "login_succeeded",
      auth_outcome: "success",
    });
  } catch {
    return { status: "error", message: "Authentication is not available in this environment." };
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

export async function forgotPasswordAction(
  previous: AuthActionState = INITIAL_AUTH_STATE,
  formData: FormData,
): Promise<AuthActionState> {
  void previous;
  const email = normalizeEmail(formData.get("email"));
  const emailError = validateEmail(email);
  if (emailError) {
    return { status: "error", message: emailError, fieldErrors: { email: emailError } };
  }

  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getPublicAppUrl()}/auth/callback?next=/auth/update-password`,
    });
  } catch {
    return { status: "error", message: "Password recovery is not configured for this environment." };
  }

  return {
    status: "success",
    message: "If the account exists, a password-recovery link has been sent.",
  };
}

export async function updatePasswordAction(
  previous: AuthActionState = INITIAL_AUTH_STATE,
  formData: FormData,
): Promise<AuthActionState> {
  void previous;
  const password = passwordFrom(formData);
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { status: "error", message: passwordError, fieldErrors: { password: passwordError } };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { status: "error", message: "The recovery session has expired. Request a new link." };

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { status: "error", message: "The password could not be updated. Request a new recovery link." };

    await supabase.rpc("record_auth_event", {
      auth_event_type: "password_updated",
      auth_outcome: "success",
    });
  } catch {
    return { status: "error", message: "Password recovery is not available in this environment." };
  }

  redirect("/workspace?notice=password-updated");
}

export async function logoutCurrentDeviceAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.rpc("record_auth_event", {
    auth_event_type: "logout_current_device",
    auth_outcome: "success",
  });
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/auth/login?notice=signed-out");
}

export async function logoutAllDevicesAction() {
  const supabase = await createServerSupabaseClient();
  const { error: revokeError } = await supabase.rpc("revoke_all_app_sessions");
  if (revokeError) redirect("/settings/security?error=logout-all-failed");

  await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  redirect("/auth/login?notice=all-devices-signed-out");
}
