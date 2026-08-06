import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/forgot-password?error=recovery-session-required");

  return <AuthForm mode="update-password" />;
}
