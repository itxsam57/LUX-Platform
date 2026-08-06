import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/forgot-password?error=recovery-session-required");
  } catch {
    redirect("/auth/login?error=configuration");
  }

  return <AuthForm mode="update-password" />;
}
